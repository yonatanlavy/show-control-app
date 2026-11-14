package app.showcontrol.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@Suppress("DEPRECATION")
private fun focusProcessor(gate: AudioInterruptionGate): PcmGainEnvelopeProcessor =
  PcmGainEnvelopeProcessor(gate).also {
    it.configureCue(1f, 0, null, 0, PcmGainEnvelopeProcessor.Curve.SMOOTH)
    it.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_16BIT))
    it.flush()
  }

private fun focusSamples(processor: PcmGainEnvelopeProcessor, frames: Int = 32): List<Int> {
  val input = ByteBuffer.allocateDirect(frames * 2).order(ByteOrder.nativeOrder())
  repeat(frames) { input.putShort(10000) }; input.flip()
  processor.queueInput(input)
  val output = processor.output.order(ByteOrder.nativeOrder())
  val result = mutableListOf<Int>()
  while (output.hasRemaining()) result += output.short.toInt()
  return result
}

/** Production PCM output and the admission gate, with deterministic control
 * interleavings. This does not prove a phone/alarm vendor's focus delivery.
 */
fun main() {
  for (signal in listOf(AudioFocusSignal.LOSS, AudioFocusSignal.TRANSIENT_LOSS, AudioFocusSignal.DUCK_LOSS)) {
    val gate = AudioInterruptionGate()
    val originalEpoch = gate.epoch
    val active = focusProcessor(gate)
    check(gate.admits(originalEpoch))
    check(focusSamples(active).all { it == 10000 })
    check(gate.onFocusSignal(signal) != null)
    check(gate.isBlocked && !gate.admits(originalEpoch))
    check(focusSamples(active).all { it == 0 }) { "Existing audio must be muted immediately on $signal" }

    // An ExoPlayer/Hit may finish allocating after the service's emergency
    // processor-list iteration. It still receives this same latched gate.
    val late = focusProcessor(gate)
    check(focusSamples(late).all { it == 0 }) { "Late-created audio escaped $signal" }
    repeat(3) { late.restartCueTimeline(); late.seekCueTimeline(400); check(focusSamples(late).all { it == 0 }) }
    late.reset()
    late.configureCue(1f, 0, null, 0, PcmGainEnvelopeProcessor.Curve.SMOOTH)
    late.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_16BIT))
    @Suppress("DEPRECATION")
    late.flush()
    check(focusSamples(late).all { it == 0 }) { "Processor reset cleared the shared interruption" }

    check(gate.onFocusSignal(AudioFocusSignal.GAIN) == null)
    check(gate.isBlocked && focusSamples(late).all { it == 0 }) { "Focus gain must not resume audio" }
    val recoveryEpoch = gate.epoch
    check(gate.admits(recoveryEpoch, explicitRecovery = true))
    check(!gate.admits(recoveryEpoch))
    check(!gate.recover(recoveryEpoch, focusGranted = false))
    check(gate.isBlocked && focusSamples(late).all { it == 0 }) { "Denied focus must leave recovery silent" }
    check(gate.recover(recoveryEpoch, focusGranted = true))
    check(gate.admits(recoveryEpoch) && focusSamples(focusProcessor(gate)).all { it == 10000 })
  }

  val racing = AudioInterruptionGate()
  racing.onFocusSignal(AudioFocusSignal.TRANSIENT_LOSS)
  val capturedRecovery = racing.epoch
  val ready = CountDownLatch(1); val finish = CountDownLatch(1)
  val callback = Thread {
    check(ready.await(2, TimeUnit.SECONDS))
    racing.onFocusSignal(AudioFocusSignal.DUCK_LOSS)
    finish.countDown()
  }
  callback.start(); ready.countDown(); check(finish.await(2, TimeUnit.SECONDS)); callback.join(2000)
  check(!racing.recover(capturedRecovery, focusGranted = true)) { "A focus grant from a stale preparation cleared a newer interruption" }
  check(!racing.admits(capturedRecovery, explicitRecovery = true))
  check(racing.isBlocked && focusSamples(focusProcessor(racing)).all { it == 0 })
  check(racing.onFocusSignal(AudioFocusSignal.GAIN) == null && racing.isBlocked)
  check(racing.recover(racing.epoch, focusGranted = true))
  for (signal in listOf(AudioFocusSignal.LOSS, AudioFocusSignal.DUCK_LOSS)) {
    val replacement = AudioInterruptionGate()
    val staleEpoch = replacement.onFocusSignal(signal)!!
    val newlyPrepared = focusProcessor(replacement)
    var staleBookkeeping = 0
    var queuedStops = 0
    // A callback can be suspended immediately after latching the loss.
    check(replacement.recover(staleEpoch, focusGranted = true))
    check(!replacement.whileCurrentInterruption(staleEpoch) { staleBookkeeping += 1 })
    if (replacement.isCurrentInterruption(staleEpoch)) queuedStops += 1
    check(staleBookkeeping == 0 && queuedStops == 0)
    check(focusSamples(newlyPrepared).all { it == 10000 }) { "A delayed old callback muted the replacement" }

    val queuedEpoch = replacement.interrupt()
    check(replacement.whileCurrentInterruption(queuedEpoch) { staleBookkeeping += 1 })
    val queuedCleanup = Runnable { if (replacement.isCurrentInterruption(queuedEpoch)) queuedStops += 1 }
    check(replacement.recover(queuedEpoch, focusGranted = true))
    queuedCleanup.run()
    check(queuedStops == 0) { "Queued focus/route cleanup stopped an explicitly recovered owner" }
  }

  val serialized = AudioInterruptionGate()
  val serializedEpoch = serialized.interrupt()
  val controlEntered = CountDownLatch(1); val releaseControl = CountDownLatch(1)
  val renderFinished = CountDownLatch(1); val recoveryStarted = CountDownLatch(1); val recoveryFinished = CountDownLatch(1)
  val control = Thread { serialized.whileCurrentInterruption(serializedEpoch) { controlEntered.countDown(); check(releaseControl.await(2, TimeUnit.SECONDS)) } }
  control.start(); check(controlEntered.await(2, TimeUnit.SECONDS))
  val render = Thread { check(focusSamples(focusProcessor(serialized)).all { it == 0 }); renderFinished.countDown() }
  val recovery = Thread { recoveryStarted.countDown(); check(serialized.recover(serializedEpoch, true)); recoveryFinished.countDown() }
  try {
    render.start(); recovery.start()
    check(renderFinished.await(1, TimeUnit.SECONDS)) { "The render path waited for the control lock" }
    check(recoveryStarted.await(1, TimeUnit.SECONDS))
    check(!recoveryFinished.await(30, TimeUnit.MILLISECONDS)) { "Recovery interleaved with old callback bookkeeping" }
  } finally { releaseControl.countDown() }
  check(recoveryFinished.await(2, TimeUnit.SECONDS))
  control.join(2000); render.join(2000); recovery.join(2000)
  check(!serialized.isBlocked)
  println("PASS production focus gate/PCM: all loss modes, late voices, loop/seek/reset, no auto-resume, denied focus and stale recovery")
}
