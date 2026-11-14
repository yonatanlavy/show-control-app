import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(path.join(root, 'modules/show-downloads/runtime-lock.json'), 'utf8'))
const directory = path.join(root, 'modules/show-downloads/android/src/main/assets')
const target = path.join(directory, 'showcontrol-yt-dlp')
const valid = (data) => data.length === lock.ytDlpBytes && createHash('sha256').update(data).digest('hex') === lock.ytDlpSha256
let cached
try { cached = await readFile(target) } catch { /* First build prepares the pinned asset. */ }
if (cached && valid(cached)) { console.log('Pinned yt-dlp ' + lock.ytDlpVersion + ' verified.'); process.exit(0) }
if (!lock.ytDlpUrl.startsWith('https://github.com/yt-dlp/yt-dlp/releases/download/') || lock.ytDlpBytes > 10_000_000) throw new Error('Invalid downloader lock')
const response = await fetch(lock.ytDlpUrl, { signal: AbortSignal.timeout(120_000) })
if (!response.ok || !response.body) throw new Error('Pinned downloader download failed: ' + response.status)
const parts = []; let length = 0
for await (const part of response.body) { length += part.length; if (length > lock.ytDlpBytes) throw new Error('Downloader size mismatch'); parts.push(part) }
const data = Buffer.concat(parts); if (!valid(data)) throw new Error('Pinned downloader checksum mismatch')
await mkdir(directory, { recursive: true })
const temp = target + '.tmp'
try { await writeFile(temp, data); await rename(temp, target) } finally { await rm(temp, { force: true }) }
console.log('Prepared checksum-verified yt-dlp ' + lock.ytDlpVersion + '.')
