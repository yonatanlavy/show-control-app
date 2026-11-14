import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import ts from 'typescript'

const root = process.cwd()
const [output, token] = process.argv.slice(2)
if (!output || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(token ?? '')) throw Error('Output and fresh UUID required')
if (fs.existsSync(output)) throw Error('Preserve existing fixtures')
const require = createRequire(path.join(root, 'package.json'))
const cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative)
  if (!file.startsWith(path.join(root, 'src') + path.sep)) throw Error('Fixture loader escaped source')
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const localRequire = (name) => name.startsWith('.') ? load(path.relative(root, path.resolve(path.dirname(file), name + '.ts'))) : name === 'zod' ? require('zod') : (() => { throw Error('Unexpected fixture import: ' + name) })()
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: file })(localRequire, module, module.exports)
  return module.exports
}
const { newShow, newAudioCue } = load('src/library/operations.ts')
const { validateLocalShow } = load('src/domain/validate-show.ts')
const prefix = 'collection-qa-' + token + '-'
let counter = 0
const id = () => prefix + (++counter)
const now = () => '2026-10-24T00:00:00.000Z'
// Original synthesized PCM; no library media is read or redistributed.
const samples = 48_000 * 10
const info = Buffer.from(token.padEnd(36, ' '))
const wav = Buffer.alloc(44 + samples * 2 + 8 + info.length)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(48_000, 24); wav.writeUInt32LE(96_000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
for (let index = 0; index < samples; index++) wav.writeInt16LE(Math.round(500 * Math.sin(2 * Math.PI * 440 * index / 48_000)), 44 + index * 2)
wav.write('JUNK', 44 + samples * 2); wav.writeUInt32LE(info.length, 48 + samples * 2); info.copy(wav, 52 + samples * 2)
const checksum = crypto.createHash('sha256').update(wav).digest('hex')
const media = { id: id(), checksumSha256: checksum, localUri: 'file:///QA_COLLECTION_MEDIA.wav', bytes: wav.length, durationMs: 10_000, codec: 'wav', channels: 1, sampleRate: 48_000 }
const large = newShow('QA Collection Large', id, now)
const songs = Array.from({ length: 1200 }, (_, index) => ({ ...newAudioCue(media.id, 'QA song ' + String(index).padStart(4, '0'), id), notes: 'Synthetic collection fixture ' + index }))
const hits = [...songs.slice(0, 10), ...Array.from({ length: 190 }, (_, index) => newAudioCue(media.id, 'QA hit ' + String(index).padStart(4, '0'), id))]
large.media = { [media.id]: media }
large.cues = Object.fromEntries([...songs, ...hits].map((cue) => [cue.id, cue]))
large.sets[0].cueOrder = songs.map((cue) => cue.id)
large.sets[0].hitCueIds = hits.map((cue) => cue.id)
const shows = [large, ...Array.from({ length: 600 }, (_, index) => newShow('QA Collection Show ' + String(index).padStart(4, '0'), id, now))]
for (const show of shows) validateLocalShow(show)
const fixture = Buffer.from(JSON.stringify({ token, prefix, media, shows }))
if (fixture.length > 4_000_000) throw Error('Fixture exceeds the bounded test contract')
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'fixture.json'), fixture)
fs.writeFileSync(path.join(output, 'tone.wav'), wav)
const metadata = { token, prefix, fixtureSha256: crypto.createHash('sha256').update(fixture).digest('hex').toUpperCase(), mediaSha256: checksum.toUpperCase(), shows: shows.length, songs: songs.length, hits: hits.length, largeShowId: large.id, largeSetId: large.sets[0].id }
fs.writeFileSync(path.join(output, 'fixture-metadata.json'), JSON.stringify(metadata, null, 2))
console.log(JSON.stringify(metadata))
