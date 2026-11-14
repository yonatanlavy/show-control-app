import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (file: string) => readFileSync(resolve(__dirname, '../..', file), 'utf8')

describe('native audio-to-audience progress boundary', () => {
  it('keeps cue-relative audio progress intact when a song has a nonzero source trim', () => {
    const androidAudio = read('modules/show-audio/android/src/main/java/app/showcontrol/audio/ShowAudioService.kt')
    const iosAudio = read('modules/show-audio/ios/ShowAudioModule.swift')
    const contract = read('src/audio/contracts.ts')
    expect(contract).toContain('Native progress is cue-relative source time')
    expect(androidAudio).toContain('"positionMs" to voice.player.currentPosition')
    expect(iosAudio).toContain('return Double(max(0, absolute - voice.trimStartFrame)) / voice.file.processingFormat.sampleRate * 1_000')
    const androidVisual = read('modules/show-visual/android/src/main/java/app/showcontrol/visual/ShowVisualModule.kt')
    const iosVisual = read('modules/show-visual/ios/ShowVisualModule.swift')
    // Example: a song trimmed at 15,000 ms reports 1,250 ms after 1.25 s.
    // The video must follow 1,250 ms, rather than max(0, 1,250 - 15,000).
    const androidProgress = androidVisual.split('if (type == "PROGRESS" && cueId')[1]!.split('private fun showCue')[0]!
    const iosProgress = iosVisual.split('if type == "PROGRESS", id')[1]!.split('private func show(')[0]!
    expect(androidProgress).toContain('actualSourceMs = event.optLong("positionMs").coerceAtLeast(0)')
    expect(iosProgress).toContain('let seconds = max(0, position.doubleValue) / 1000')
    expect(androidProgress).not.toContain('trimIn')
    expect(iosProgress).not.toContain('trimIn')
  })
})
