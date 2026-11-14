package app.showcontrol.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.roundToInt

/** Standalone JVM regression against the production Media3 PCM processor. */
@Suppress("DEPRECATION") // Compatibility harness uses the no-metadata flush entry point.
private fun processor(rate: Double = 1.0, fadeInMs: Long = 0): PcmGainEnvelopeProcessor =
  PcmGainEnvelopeProcessor().also {
    it.configureCue(1f, fadeInMs, null, 0, PcmGainEnvelopeProcessor.Curve.SMOOTH, rate)
    it.configure(AudioProcessor.AudioFormat(1000, 1, C.ENCODING_PCM_16BIT))
    it.flush()
  }

private fun samples(processor: PcmGainEnvelopeProcessor, frames: Int): List<Int> {
  val input = ByteBuffer.allocateDirect(frames * 2).order(ByteOrder.nativeOrder())
  repeat(frames) { input.putShort(10000) }
  input.flip()
  processor.queueInput(input)
  val result = mutableListOf<Int>()
  val output = processor.output.order(ByteOrder.nativeOrder())
  while (output.hasRemaining()) result += output.short.toInt()
  return result
}

fun main() {
  for (rate in listOf(0.7, 1.0, 2.0)) {
    val audio = processor(rate)
    var completions = 0
    audio.scheduleFadeToSilence(2000, PcmGainEnvelopeProcessor.Curve.SMOOTH) { completions += 1 }
    val halfway = (1000 * rate).roundToInt()
    samples(audio, halfway)
    val beforeLoop = samples(audio, 1).single()
    audio.restartCueTimeline()
    val afterLoop = samples(audio, 1).single()
    check(abs(beforeLoop - afterLoop) < 40) { "Loop reset must preserve the active fade at ${rate}x" }
    check(afterLoop in 4900..5100) { "A two-second real-time fade must be half complete after one second at ${rate}x" }
    val remaining = (2000 * rate).roundToInt() - halfway
    samples(audio, remaining + 2)
    check(completions == 1) { "A fade crossing a loop boundary must complete exactly once" }
    audio.restartCueTimeline()
    check(samples(audio, 20).all { it == 0 }) { "A completed safety fade must not restart audible audio on repeat" }
  }

  val rapidLoops = processor()
  var panicCompletions = 0
  rapidLoops.scheduleFadeToSilence(2000, PcmGainEnvelopeProcessor.Curve.SMOOTH) { panicCompletions += 1 }
  repeat(8) { samples(rapidLoops, 300); rapidLoops.restartCueTimeline() }
  check(panicCompletions == 1 && samples(rapidLoops, 1).single() == 0) { "A short loop must not outlive panic" }

  val muted = processor()
  samples(muted, 50)
  muted.emergencyMute()
  repeat(3) { muted.restartCueTimeline(); check(samples(muted, 50).all { it == 0 }) }
  muted.seekCueTimeline(1000)
  check(samples(muted, 50).all { it == 0 }) { "Looping and seeking must preserve emergency mute" }

  val seeking = processor()
  var seekCompletions = 0
  seeking.scheduleFadeToSilence(1000, PcmGainEnvelopeProcessor.Curve.SMOOTH) { seekCompletions += 1 }
  samples(seeking, 500)
  seeking.seekCueTimeline(0)
  check(samples(seeking, 1).single() in 4900..5100) { "Seek must not reset an active safety fade" }
  samples(seeking, 501)
  check(seekCompletions == 1) { "Seek must not lose fade completion" }

  val fadeIn = processor(fadeInMs = 1000)
  check(samples(fadeIn, 1).single() == 0)
  samples(fadeIn, 500)
  fadeIn.restartCueTimeline()
  check(samples(fadeIn, 1).single() == 10000) { "A loop repeats at its set level instead of restarting fade-in" }

  val replaced = processor()
  var staleCompletions = 0
  var currentCompletions = 0
  replaced.scheduleFadeToSilence(1000, PcmGainEnvelopeProcessor.Curve.SMOOTH) { staleCompletions += 1 }
  samples(replaced, 500)
  replaced.scheduleFadeToSilence(1000, PcmGainEnvelopeProcessor.Curve.SMOOTH) { currentCompletions += 1 }
  replaced.restartCueTimeline()
  samples(replaced, 1001)
  check(staleCompletions == 0 && currentCompletions == 1) { "Replacing a fade must retain only its current completion" }
  println("PASS production PCM: rate, repeated loops, panic completion, seek and emergency mute")
}
