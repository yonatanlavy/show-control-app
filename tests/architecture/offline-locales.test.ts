import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type GradleSource = { language: string; contents: string }
const { applyOfflineLocales } = jest.requireActual<{ applyOfflineLocales: (source: GradleSource) => GradleSource }>('../../plugins/with-offline-locales')

it('registers offline language packaging in the source-owned Expo configuration', () => {
  expect(readFileSync(resolve(__dirname, '../../app.config.ts'), 'utf8')).toContain("'./plugins/with-offline-locales'")
})

it('preserves the generated app while bundling languages locally and remains idempotent on regeneration', () => {
  const original = { language: 'groovy', contents: "apply plugin: 'com.android.application'\nandroid { defaultConfig { minSdkVersion 24 } }\n" }
  const configured = applyOfflineLocales(original)
  expect(configured.contents).toContain(original.contents.trimEnd())
  expect(configured.contents).toContain('android.bundle.language.enableSplit = false')
  expect(configured.contents).toContain('android.defaultConfig.resourceConfigurations.add("iw")')
  expect(applyOfflineLocales(configured)).toEqual(configured)
  expect(original.contents).not.toContain('enableSplit')
})

it('upgrades only its known older block so Expo does not filter legacy Hebrew resources out of the APK', () => {
  const original = { language: 'groovy', contents: 'android { defaultConfig { resourceConfigurations += ["b+en", "b+he", "b+ar"] } }\n\n// Show Control: keep presentation languages offline.\nandroid.bundle.language.enableSplit = false\n' }
  const configured = applyOfflineLocales(original)
  expect(configured.contents).toContain('resourceConfigurations += ["b+en", "b+he", "b+ar"]')
  expect(configured.contents).toContain('resourceConfigurations.add("iw")')
  expect(applyOfflineLocales(configured)).toEqual(configured)
})

it.each(['kotlin', 'unknown'])('rejects an unsupported %s build instead of silently omitting offline languages', (language) => {
  expect(() => applyOfflineLocales({ language, contents: '' })).toThrow('Groovy')
})

it('requires review if a previous generated configuration is incomplete or duplicated', () => {
  const marker = '// Show Control: keep presentation languages offline.'
  expect(() => applyOfflineLocales({ language: 'groovy', contents: `${marker}\nandroid.bundle.language.enableSplit = true\n` })).toThrow('Review')
  const configured = applyOfflineLocales({ language: 'groovy', contents: '' })
  expect(() => applyOfflineLocales({ ...configured, contents: configured.contents + configured.contents })).toThrow('Review')
})
