package app.showcontrol.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin

/**
 * Applies cue gain, fade-in/fade-out and live fades in decoded PCM space.
 *
 * The audio renderer advances [processedFrames], so an envelope pauses with the
 * audio clock and is independent of React, bridge latency and wall-clock timers.
 * Updates are immutable atomic snapshots because commands and the audio sink can
 * run on different native threads.
 */
@UnstableApi
internal class PcmGainEnvelopeProcessor(private val interruptionGate: AudioInterruptionGate? = null) : BaseAudioProcessor() {
  internal enum class Curve { LINEAR, SMOOTH, EQUAL_POWER }

  private data class Timeline(
    val baseGain: Float,
    val fadeInMs: Long,
    val fadeOutStartMs: Long?,
    val fadeOutDurationMs: Long,
    val curve: Curve,
  )

  private data class LiveEnvelope(
    val startFrame: Long,
    val fromMultiplier: Float,
    val toMultiplier: Float,
    val durationMs: Long,
    val curve: Curve,
    val completion: AtomicReference<(() -> Unit)?>,
  )

  private val timeline = AtomicReference(
    Timeline(baseGain = 1f, fadeInMs = 0, fadeOutStartMs = null, fadeOutDurationMs = 0, curve = Curve.SMOOTH),
  )
  private val liveEnvelope = AtomicReference<LiveEnvelope?>(null)
  private val processedFrames = AtomicLong(0)
  // Live fades use a continuous render clock. Cue/source positions may rewind
  // on loop or seek without cancelling a safety fade already in flight.
  private val renderedFrames = AtomicLong(0)
  private val looped = AtomicBoolean(false)
  private val configuredSampleRate = AtomicLong(48_000)
  private val emergencyMuted = AtomicBoolean(false)
  private val playbackRate = AtomicReference(1.0)

  fun configureCue(
    baseGain: Float,
    fadeInMs: Long,
    fadeOutStartMs: Long?,
    fadeOutDurationMs: Long,
    curve: Curve,
    rate: Double = 1.0,
  ) {
    require(rate.isFinite() && rate in 0.7..2.0)
    playbackRate.set(rate)
    timeline.set(
      Timeline(
        baseGain = baseGain.coerceIn(0f, MAX_GAIN),
        fadeInMs = (fadeInMs.coerceAtLeast(0) * rate).roundToLong(),
        fadeOutStartMs = fadeOutStartMs?.coerceAtLeast(0),
        fadeOutDurationMs = (fadeOutDurationMs.coerceAtLeast(0) * rate).roundToLong(),
        curve = curve,
      ),
    )
    processedFrames.set(0)
    renderedFrames.set(0)
    looped.set(false)
    liveEnvelope.getAndSet(null)?.completion?.set(null)
    emergencyMuted.set(false)
  }

  fun restartCueTimeline() {
    processedFrames.set(0)
    looped.set(true)
  }

  fun seekCueTimeline(positionMs: Long) {
    val sampleRate = configuredSampleRate.get().coerceAtLeast(1)
    processedFrames.set(positionMs.coerceAtLeast(0) * sampleRate / 1_000)
  }

  fun scheduleFadeToSilence(durationMs: Long, curve: Curve, onComplete: (() -> Unit)? = null) {
    val nowFrame = renderedFrames.get()
    val from = multiplierAt(nowFrame, liveEnvelope.get())
    liveEnvelope.set(
      LiveEnvelope(
        startFrame = nowFrame,
        fromMultiplier = from,
        toMultiplier = 0f,
        durationMs = (durationMs.coerceAtLeast(0) * playbackRate.get()).roundToLong(),
        curve = curve,
        completion = AtomicReference(onComplete),
      ),
    )
  }

  /** Mutes the next PCM buffer even before the serialized stop reaches players. */
  fun emergencyMute() {
    emergencyMuted.set(true)
    liveEnvelope.get()?.completion?.set(null)
  }

  override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
    if (inputAudioFormat.encoding != C.ENCODING_PCM_16BIT) {
      throw AudioProcessor.UnhandledAudioFormatException(inputAudioFormat)
    }
    configuredSampleRate.set(inputAudioFormat.sampleRate.toLong())
    return inputAudioFormat
  }

  override fun queueInput(inputBuffer: ByteBuffer) {
    val output = replaceOutputBuffer(inputBuffer.remaining()).order(ByteOrder.nativeOrder())
    inputBuffer.order(ByteOrder.nativeOrder())

    val channelCount = inputAudioFormat.channelCount.coerceAtLeast(1)
    val bytesPerFrame = channelCount * Short.SIZE_BYTES

    while (inputBuffer.remaining() >= bytesPerFrame) {
      val frame = processedFrames.getAndIncrement()
      val renderFrame = renderedFrames.getAndIncrement()
      val gain = if (emergencyMuted.get() || interruptionGate?.isBlocked == true) 0f else gainAt(frame, renderFrame)

      repeat(channelCount) {
        val sample = inputBuffer.short.toInt()
        val scaled = (sample * gain)
          .roundToInt()
          .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
        output.putShort(scaled.toShort())
      }
    }

    // Media3 supplies complete frames, but preserve any unexpected trailing
    // bytes rather than reading beyond the input buffer.
    while (inputBuffer.hasRemaining()) output.put(inputBuffer.get())
    output.flip()
  }

  override fun onReset() {
    processedFrames.set(0)
    renderedFrames.set(0)
    looped.set(false)
    liveEnvelope.getAndSet(null)?.completion?.set(null)
    emergencyMuted.set(false)
  }

  private fun gainAt(frame: Long, renderFrame: Long): Float {
    val cueTimeline = timeline.get()
    val sampleRate = configuredSampleRate.get().coerceAtLeast(1)
    val positionMs = frame * 1_000.0 / sampleRate

    var cueMultiplier = 1f
    if (!looped.get() && cueTimeline.fadeInMs > 0 && positionMs < cueTimeline.fadeInMs) {
      cueMultiplier = interpolate(
        0f,
        1f,
        (positionMs / cueTimeline.fadeInMs).toFloat(),
        cueTimeline.curve,
      )
    }

    val fadeOutStartMs = cueTimeline.fadeOutStartMs
    if (fadeOutStartMs != null && positionMs >= fadeOutStartMs) {
      val progress = if (cueTimeline.fadeOutDurationMs == 0L) {
        1f
      } else {
        ((positionMs - fadeOutStartMs) / cueTimeline.fadeOutDurationMs).toFloat()
      }
      cueMultiplier = minOf(
        cueMultiplier,
        interpolate(1f, 0f, progress, cueTimeline.curve),
      )
    }

    return (cueTimeline.baseGain * cueMultiplier * multiplierAt(renderFrame, liveEnvelope.get()))
      .coerceIn(0f, MAX_GAIN)
  }

  private fun multiplierAt(frame: Long, envelope: LiveEnvelope?): Float {
    envelope ?: return 1f
    val sampleRate = configuredSampleRate.get().coerceAtLeast(1)
    val durationFrames = envelope.durationMs * sampleRate / 1_000
    val progress = if (durationFrames <= 0) {
      1f
    } else {
      (frame - envelope.startFrame).toFloat() / durationFrames
    }
    if (progress >= 1f && !emergencyMuted.get()) envelope.completion.getAndSet(null)?.invoke()
    return interpolate(
      envelope.fromMultiplier,
      envelope.toMultiplier,
      progress,
      envelope.curve,
    )
  }

  private fun interpolate(from: Float, to: Float, rawProgress: Float, curve: Curve): Float {
    val progress = rawProgress.coerceIn(0f, 1f)
    val shaped = when (curve) {
      Curve.LINEAR -> progress
      Curve.SMOOTH -> progress * progress * (3f - 2f * progress)
      Curve.EQUAL_POWER -> if (to >= from) {
        sin(progress * PI.toFloat() / 2f)
      } else {
        1f - cos(progress * PI.toFloat() / 2f)
      }
    }
    return from + (to - from) * shaped
  }

  private companion object {
    const val MAX_GAIN = 4f
  }
}
