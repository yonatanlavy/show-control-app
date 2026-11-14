import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(__dirname, '../..', path), 'utf8')

describe('native audience image ownership boundary', () => {
  it('keeps image disk decoding outside both UI renderers', () => {
    const android = read('modules/show-visual/android/src/main/java/app/showcontrol/visual/ShowVisualModule.kt').split('private class AudiencePresentation')[1]!
    const ios = read('modules/show-visual/ios/ShowVisualModule.swift').split('private final class AudienceCanvas')[1]!.split('// Expo SDK')[0]!
    expect(android).not.toContain('BitmapFactory.decode')
    expect(ios).not.toContain('CGImageSourceCreate')
    expect(android).toContain('images.submit({ AudienceImageDecoder.decode(file) })')
    expect(ios).toContain('images.submit({ try AudienceImageDecoder.decode(url) })')
    expect(android).toContain('imageHandler.post(task)')
    expect(ios).toContain('images.cancel()')
    expect(android).toContain('images.cancel()')
  })
  it('bounds image decoding independently of previously validated import metadata', () => {
    const android = read('modules/show-visual/android/src/main/java/app/showcontrol/visual/AudienceImageDecoder.kt')
    const ios = read('modules/show-visual/ios/AudienceImageDecoder.swift')
    expect(android).toContain('40_000_000')
    expect(ios).toContain('40_000_000 / height')
    expect(android).toContain('1920')
    expect(ios).toContain('kCGImageSourceShouldCacheImmediately: true')
  })
  it('rejects output callbacks after teardown and marshals iOS seek completion before state access', () => {
    const android = read('modules/show-visual/android/src/main/java/app/showcontrol/visual/ShowVisualModule.kt')
    const ios = read('modules/show-visual/ios/ShowVisualModule.swift')
    expect(android).toContain('if (destroyed || !enabled || presentation != null) return')
    expect(ios).toContain('guard !destroyed, enabled, output == nil else { return }')
    expect(ios).toMatch(/player\.seek[\s\S]*?DispatchQueue\.main\.async[\s\S]*?self\.renderRevision == revision, !self\.paused/)
  })
})
