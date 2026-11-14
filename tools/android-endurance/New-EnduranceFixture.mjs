import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { root, loadSource } from './source-loader.mjs';

const { newShow, newAudioCue } = loadSource('src/library/operations.ts');
const { DEFAULT_LIBRARY_SETTINGS } = loadSource('src/library/types.ts');
const { makeLibraryManifest, validateLibraryManifest } = loadSource('src/storage/library-bundle.ts');
const { writeStoredZip, inspectStoredZip, extractStoredEntry } = loadSource('src/storage/zip.ts');
const { compileRunSnapshot } = loadSource('src/domain/compiler.ts');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const token = crypto.randomUUID();
const output = path.join(root, '.native-check', 'native-endurance-' + token);
if (fs.existsSync(output)) throw Error('Preserve existing fixture');
const id = () => crypto.randomUUID();

// Original, quiet, eight-second mono PCM. No downloaded/commercial media.
const sampleRate = 44100, frames = sampleRate * 8;
const pcm = Buffer.alloc(44 + frames * 2);
pcm.write('RIFF'); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(sampleRate, 24); pcm.writeUInt32LE(sampleRate * 2, 28);
pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(pcm.length - 44, 40);
for (let frame = 0; frame < frames; frame++) pcm.writeInt16LE(Math.round(64 * Math.sin(2 * Math.PI * 247 * frame / sampleRate)), 44 + frame * 2);
const checksum = sha256(pcm), mediaId = 'media-' + checksum, payloadPath = `media/${checksum}.wav`;
const show = newShow('QA Endurance ' + token.slice(0, 8), id, () => new Date().toISOString());
show.panicFadeMs = 4000;
show.media = { [mediaId]: { id: mediaId, checksumSha256: checksum, localUri: 'file:///synthetic-endurance/' + checksum + '.wav',
  bytes: pcm.length, durationMs: 8000, codec: 'audio/raw', channels: 1, sampleRate } };
const cue = (name, changes = {}) => ({ ...newAudioCue(mediaId, name, id), gainDb: -36, endBehavior: 'loop',
  notes: 'Original synthetic QA tone. Explicit GO only; not performance music.', tags: ['qa-endurance'], ...changes });
const main = cue('Continuous main loop', { trimInMs: 500, trimOutMs: 7500, playbackRate: 1.25, crossfadeEnabled: true });
const incoming = cue('Deliberate next · capacity check', { trimInMs: 1000, trimOutMs: 7000, playbackRate: 0.7, autoPlay: true, preWaitMs: 1000 });
const rates = [0.7, 0.85, 1, 1.25, 1.5, 1.75, 2];
const trims = [500, 700, 1000, 1500, 2500, 4000, 7000];
const hits = rates.map((playbackRate, index) => cue(`Loop Hit ${index + 1} · ${playbackRate}x`, { trimOutMs: trims[index], playbackRate }));
const ensemble = { id: id(), name: 'Seven looping Hits', type: 'group', tags: ['qa-endurance'], children: hits.map((hit, index) => ({ cueId: hit.id, offsetMs: index * 75 })) };
const allEight = { id: id(), name: 'Eight loops · legacy', type: 'group', tags: ['qa-endurance'], children: [main, ...hits].map((child) => ({ cueId: child.id, offsetMs: 0 })) };
const definitions = [main, incoming, ...hits, ensemble, allEight];
show.cues = Object.fromEntries(definitions.map((definition) => [definition.id, definition]));
show.sets[0] = { ...show.sets[0], name: 'OMS · eight native voices', cueOrder: [main.id, incoming.id], hitCueIds: [ensemble.id, hits[0].id] };
show.sets.push({ id: id(), name: 'Legacy · eight native voices', cueOrder: [allEight.id, incoming.id], hitCueIds: [], transportMode: 'legacyCueStack' });
for (const set of show.sets) { const compiled = compileRunSnapshot(show, set.id, []); if (!compiled.ok) throw Error('Fixture does not compile: ' + JSON.stringify(compiled.issues)); }
const settings = { ...DEFAULT_LIBRARY_SETTINGS, locale: 'en', theme: 'purpleNight', onboardingCompleted: true, externalDisplayEnabled: false };
const manifest = makeLibraryManifest([show], [], settings, show.id, show.sets[0].id, id());
const files = new Map([['manifest.json', Buffer.from(JSON.stringify(manifest))], [payloadPath, pcm]]);
const sources = [...files].map(([name, bytes]) => ({ path: name, bytes: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length) }));
const chunks = []; await writeStoredZip(sources, { write: async (bytes) => chunks.push(Buffer.from(bytes)) });
const archive = Buffer.concat(chunks), reader = { size: archive.length, read: async (offset, length) => archive.subarray(offset, offset + length) };
const directory = await inspectStoredZip(reader);
validateLibraryManifest(manifest, directory);
for (const entry of directory) {
  const extracted = []; await extractStoredEntry(reader, entry, { write: async (bytes) => extracted.push(Buffer.from(bytes)) });
  if (!Buffer.concat(extracted).equals(files.get(entry.path))) throw Error('Fixture CRC/extracted content differs');
}
fs.mkdirSync(output);
fs.writeFileSync(path.join(output, 'endurance.zip'), archive, { flag: 'wx' });
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
const result = { token, showName: show.name, archivePath: path.join(output, 'endurance.zip'), archiveBytes: archive.length, sha256: sha256(archive),
  mediaSha256: checksum, playlists: show.sets.map(({ name, transportMode }) => ({ name, transportMode })), audioCues: 9, groups: 2, maxConcurrentVoices: 8,
  main: { id: main.id, name: main.name }, incoming: { id: incoming.id, name: incoming.name }, ensemble: { id: ensemble.id, name: ensemble.name },
  hitRates: rates, hitTrimMs: trims, panicFadeMs: show.panicFadeMs, canonicalCompilerManifestZipAndCrcVerified: true, providerRequests: 0 };
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
process.stdout.write(JSON.stringify(result, null, 2));
