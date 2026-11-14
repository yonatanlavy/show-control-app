import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'package.json'))
const ts = require('typescript')
const cache = new Map()
// Load only the source-owned, side-effect-free dictionary modules; type imports disappear.
function load(relative) {
  const filename = path.resolve(root, relative)
  if (!filename.startsWith(path.join(root, 'src', 'i18n') + path.sep)) throw new Error('Dictionary import escaped the i18n directory')
  if (cache.has(filename)) return cache.get(filename)
  const source = readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  cache.set(filename, module.exports)
  const localRequire = (name) => { if (!name.startsWith('./')) throw new Error(`Unexpected dictionary import ${name}`); return load(path.relative(root, path.resolve(path.dirname(filename), `${name}.ts`))) }
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, module, module.exports)
  return module.exports
}
const { messages } = load('src/i18n/messages.ts')
export const verifiedMessages = messages
const expected = ['en', 'he', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ar']
if (Object.keys(messages).sort().join('|') !== expected.sort().join('|')) throw new Error('All ten language dictionaries are required')
const englishKeys = Object.keys(messages.en).sort()
const placeholders = (message) => [...message.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort().join('|')
for (const [locale, dictionary] of Object.entries(messages)) {
  if (Object.keys(dictionary).sort().join('|') !== englishKeys.join('|')) throw new Error(`Key parity failed: ${locale}`)
  for (const key of englishKeys) {
    if (typeof dictionary[key] !== 'string' || !dictionary[key].trim()) throw new Error(`Empty ${locale} translation: ${key}`)
    if (placeholders(dictionary[key]) !== placeholders(messages.en[key])) throw new Error(`Placeholder mismatch: ${locale}/${key}`)
  }
  const native = JSON.parse(readFileSync(path.join(root, 'src', 'i18n', 'native', `${locale}.json`), 'utf8'))
  const expectedPermissions = { NSMicrophoneUsageDescription: dictionary['permission.microphone'], NSBluetoothAlwaysUsageDescription: dictionary['permission.bluetooth'], NSDocumentsFolderUsageDescription: dictionary['permission.documents'], NSLocalNetworkUsageDescription: dictionary['permission.localNetwork'] }
  if (Object.keys(native.ios ?? {}).sort().join('|') !== Object.keys(expectedPermissions).sort().join('|')) throw new Error(`Permission key mismatch: ${locale}`)
  for (const [key, text] of Object.entries(expectedPermissions)) if (native.ios[key] !== text) throw new Error(`Native permission translation is stale: ${locale}/${key}`)
  const qualifier = locale === 'en' ? 'values' : locale === 'he' ? 'values-iw' : 'values-b+' + locale
  const xml = readFileSync(path.join(root, 'modules', 'show-voice', 'android', 'src', 'main', 'res', qualifier, 'strings.xml'), 'utf8')
  const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll("'", "\\'").replaceAll('"', '\\"')
  for (const [id, key] of [['showcontrol_voice_channel_name', 'notification.voiceChannel'], ['showcontrol_voice_armed_body', 'notification.voiceArmed']]) {
    if (!xml.includes(`<string name="${id}">${escapeXml(dictionary[key])}</string>`)) throw new Error(`Native notification translation is stale: ${locale}/${id}`)
  }
  const downloadXml = readFileSync(path.join(root, 'modules', 'show-downloads', 'android', 'src', 'main', 'res', qualifier, 'strings.xml'), 'utf8')
  for (const [id, text] of [['download_channel', 'Show Control · ' + dictionary['download.history']], ['download_running', dictionary['download.stage.downloading']], ['download_cancel', dictionary['common.cancel']]]) {
    if (!downloadXml.includes('<string name="' + id + '">' + escapeXml(text) + '</string>')) throw new Error('Native download translation is stale: ' + locale + '/' + id)
  }
  const audioXml = readFileSync(path.join(root, 'modules', 'show-audio', 'android', 'src', 'main', 'res', qualifier, 'strings.xml'), 'utf8')
  for (const [id, key] of [
    ['show_audio_notification_title', 'background.notificationTitle'],
    ['show_audio_notification_channel', 'background.notificationChannel'],
    ['show_audio_notification_battery_warning', 'background.notificationBatteryWarning'],
    ['show_audio_notification_settings_unknown', 'background.notificationSettingsUnknown'],
    ['show_audio_notification_low_battery', 'background.notificationLowBattery'],
    ['show_audio_notification_heat', 'background.notificationHeat'],
    ['show_audio_notification_memory', 'background.notificationMemory'],
    ['show_audio_notification_prepared', 'background.notificationPrepared'],
    ['show_audio_notification_active', 'background.notificationActive'],
    ['show_audio_notification_recovery', 'background.notificationRecovery'],
    ['show_audio_notification_go', 'run.go'],
    ['show_audio_notification_previous', 'command.PREVIOUS'],
    ['show_audio_notification_resume', 'run.resume'],
    ['show_audio_notification_stop', 'recovery.stop'],
  ]) {
    if (!audioXml.includes(`<string name="${id}">${escapeXml(dictionary[key])}</string>`)) throw new Error(`Native audio notification translation is stale: ${locale}/${id}`)
  }
}
console.log(`Translation parity passed for ${englishKeys.length} messages and native OS copy in all ten languages.`)
