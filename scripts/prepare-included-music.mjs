import { createHash } from 'node:crypto';
import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'modules/show-downloads/android/src/main/assets/showcontrol-music');
const names = ['library.zip', 'manifest.json', 'CREDITS.md', 'ARTWORK-LICENSE.txt', 'LICENSE-PROVENANCE.json'];
if (!process.argv.includes('--include')) {
  // Only our fixed, generated files; never sweep the assets directory.
  for (const name of names) rmSync(path.join(output, name), { force: true });
  process.exit(0);
}
const source = path.join(root, 'music-library');
const archive = path.join(source, 'Show-Control-Magic-Music-170.zip');
if (!existsSync(archive)) {
  // The archive is kept out of Git (it exceeds GitHub's file limit). Absence
  // means "build without included music"; a present but changed archive or
  // recording below still fails the build.
  for (const name of names) rmSync(path.join(output, name), { force: true });
  console.warn(`Included music skipped: ${path.relative(root, archive)} is not present. The app builds without the bundled 170-song library.`);
  process.exit(0);
}
const catalog = JSON.parse(readFileSync(path.join(source, 'catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(source, 'manifest.json'), 'utf8'));
if (!Array.isArray(catalog) || catalog.length !== 170 || new Set(catalog.map((song) => song.sha256)).size !== 170 || manifest.shows?.length !== 1 || manifest.shows[0].sets?.length !== 20) throw new Error('Expected the complete 170-song / 20-playlist collection');
const hash = async (file) => { const digest = createHash('sha256'); for await (const chunk of createReadStream(file)) digest.update(chunk); return digest.digest('hex'); };
const expected = '8bb7f7c3bf932162f8615ea66e7c2452a5a21782ce838b0bcde30b2c4b691101';
if (await hash(archive) !== expected) throw new Error('Full music archive checksum changed');
for (const song of catalog) {
  const file = path.resolve(source, song.file);
  if (!file.startsWith(source + path.sep) || !existsSync(file) || statSync(file).size !== song.bytes || await hash(file) !== song.sha256) throw new Error(`Music file missing or changed: ${song.number}`);
}
mkdirSync(output, { recursive: true });
const destination = path.join(output, 'library.zip');
if (!existsSync(destination) || statSync(destination).size !== statSync(archive).size || await hash(destination) !== expected) copyFileSync(archive, destination);
for (const name of names.slice(2)) copyFileSync(path.join(source, name), path.join(output, name));
writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ version: 'music-170-v1', songs: 170, playlists: 20, bytes: statSync(archive).size, sha256: expected, hashes: catalog.map((song) => song.sha256) }, null, 2) + '\n');
console.log(`Included music verified: 170 distinct recordings, ${statSync(archive).size} archive bytes, 20 playlists, credits retained.`);
