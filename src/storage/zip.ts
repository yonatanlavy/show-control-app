import { strFromU8, strToU8 } from 'fflate';
import { checkBackupCancelled } from './backup-progress';

/** Standard ZIP32, UTF-8 names, STORE method. Bounded random access avoids whole-file buffering. */
export interface ZipReader { readonly size: number; read(offset: number, length: number): Promise<Uint8Array> }
export interface ZipWriter { write(bytes: Uint8Array): Promise<void> }
export interface ZipFileSource { readonly path: string; readonly bytes: number; read(offset: number, length: number): Promise<Uint8Array> }
export interface StoredZipEntry { readonly path: string; readonly bytes: number; readonly crc32: number; readonly dataOffset: number }
export const ZIP_LIMITS = { maxFiles: 501, maxFileBytes: 1_000_000_000, maxTotalBytes: 4_000_000_000, maxManifestBytes: 8_000_000 } as const;
export function safeArchivePath(path: string): boolean {
  return path.length > 0 && path.length <= 1024 && path.normalize('NFC') === path && !path.includes('\\') &&
    !/[\u0000-\u001f\u007f:]/.test(path) && !path.startsWith('/') &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
const u16 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
const u32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
function header(size: number): { bytes: Uint8Array; view: DataView } { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
const crcTable = Uint32Array.from({ length: 256 }, (_value, index) => { let crc = index; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); return crc >>> 0; });
export function updateCrc32(state: number, bytes: Uint8Array): number { let crc = state; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8); return crc >>> 0; }
async function exactRead(source: ZipReader | ZipFileSource, offset: number, length: number): Promise<Uint8Array> {
  const value = await source.read(offset, length);
  if (value.length !== length) throw new Error('Archive or source file was truncated.');
  return value;
}
interface ZipOperationOptions { readonly signal?: AbortSignal; readonly onProgress?: (bytes: number, files: number) => void }
async function yieldArchiveWork(signal?: AbortSignal): Promise<void> {
  // Native file-handle reads are synchronous. Give touch Cancel a turn between bounded batches.
  await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupCancelled(signal);
}
async function crcFile(source: ZipFileSource, signal?: AbortSignal): Promise<number> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < source.bytes; offset += 262144) { if (offset % 4194304 === 0) await yieldArchiveWork(signal); checkBackupCancelled(signal); crc = updateCrc32(crc, await exactRead(source, offset, Math.min(262144, source.bytes - offset))); }
  checkBackupCancelled(signal);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function writeStoredZip(files: readonly ZipFileSource[], sink: ZipWriter, options: ZipOperationOptions = {}): Promise<void> {
  checkBackupCancelled(options.signal);
  if (files.length > ZIP_LIMITS.maxFiles) throw new Error('Backup has too many files.');
  const names = new Set<string>(); let total = 0;
  for (const file of files) {
    if (!safeArchivePath(file.path) || names.has(file.path.toLowerCase())) throw new Error('Backup path is unsafe or duplicated.');
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > ZIP_LIMITS.maxFileBytes) throw new Error('Backup file exceeds the size limit.');
    total += file.bytes; names.add(file.path.toLowerCase());
  }
  if (total > ZIP_LIMITS.maxTotalBytes) throw new Error('Backup exceeds the size limit.');
  const central: Uint8Array[] = []; let offset = 0; let completedBytes = 0; let completedFiles = 0;
  for (const file of files) {
    checkBackupCancelled(options.signal);
    const name = strToU8(file.path); const crc = await crcFile(file, options.signal); const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(12, 0x0021, true); // Valid DOS date: 1 January 1980.
    local.view.setUint32(14, crc, true); local.view.setUint32(18, file.bytes, true); local.view.setUint32(22, file.bytes, true); local.view.setUint16(26, name.length, true); local.bytes.set(name, 30);
    await sink.write(local.bytes);
    for (let position = 0; position < file.bytes; position += 262144) {
      if (position % 4194304 === 0) await yieldArchiveWork(options.signal);
      checkBackupCancelled(options.signal); const chunk = await exactRead(file, position, Math.min(262144, file.bytes - position));
      checkBackupCancelled(options.signal); await sink.write(chunk); completedBytes += chunk.length; options.onProgress?.(completedBytes, completedFiles);
    }
    completedFiles += 1; options.onProgress?.(completedBytes, completedFiles);
    const directory = header(46 + name.length);
    directory.view.setUint32(0, 0x02014b50, true); directory.view.setUint16(4, 20, true); directory.view.setUint16(6, 20, true); directory.view.setUint16(8, 0x0800, true);
    directory.view.setUint16(14, 0x0021, true);
    directory.view.setUint32(16, crc, true); directory.view.setUint32(20, file.bytes, true); directory.view.setUint32(24, file.bytes, true);
    directory.view.setUint16(28, name.length, true); directory.view.setUint32(42, offset, true); directory.bytes.set(name, 46); central.push(directory.bytes);
    offset += local.bytes.length + file.bytes;
  }
  const centralOffset = offset;
  for (const entry of central) { checkBackupCancelled(options.signal); await sink.write(entry); offset += entry.length; }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, offset - centralOffset, true); end.view.setUint32(16, centralOffset, true); checkBackupCancelled(options.signal); await sink.write(end.bytes);
}
export async function inspectStoredZip(source: ZipReader, signal?: AbortSignal): Promise<readonly StoredZipEntry[]> {
  checkBackupCancelled(signal);
  if (!Number.isSafeInteger(source.size) || source.size < 22 || source.size > ZIP_LIMITS.maxTotalBytes + 2_000_000) throw new Error('Archive size is invalid.');
  const end = await exactRead(source, source.size - 22, 22);
  if (u32(end, 0) !== 0x06054b50 || u16(end, 4) !== 0 || u16(end, 6) !== 0 || u16(end, 20) !== 0 || u16(end, 8) !== u16(end, 10)) throw new Error('Only single-volume Show Control ZIP archives are supported.');
  const count = u16(end, 10); const centralBytes = u32(end, 12); const centralOffset = u32(end, 16);
  if (count > ZIP_LIMITS.maxFiles || centralBytes > 2_000_000 || centralOffset + centralBytes !== source.size - 22) throw new Error('Archive directory exceeds safety limits.');
  const entries: StoredZipEntry[] = []; const names = new Set<string>(); let total = 0; let cursor = centralOffset; let previousEnd = 0;
  for (let index = 0; index < count; index++) {
    checkBackupCancelled(signal);
    const entry = await exactRead(source, cursor, 46);
    if (u32(entry, 0) !== 0x02014b50) throw new Error('Archive directory is corrupt.');
    const flags = u16(entry, 8), method = u16(entry, 10), compressed = u32(entry, 20), bytes = u32(entry, 24);
    const nameLength = u16(entry, 28), extraLength = u16(entry, 30), commentLength = u16(entry, 32), localOffset = u32(entry, 42), attributes = u32(entry, 38);
    const unixType = (attributes >>> 16) & 0xf000;
    if (flags !== 0x0800 || method !== 0 || compressed !== bytes || extraLength !== 0 || commentLength !== 0 || u16(entry, 34) !== 0 ||
        (unixType !== 0 && unixType !== 0x8000) || (attributes & 0x10) || nameLength < 1 || nameLength > 1024 || localOffset !== previousEnd)
      throw new Error('Archive contains an unsupported, linked, encrypted, compressed or unordered entry.');
    const nameBytes = await exactRead(source, cursor + 46, nameLength); const path = strFromU8(nameBytes);
    if (!safeArchivePath(path) || names.has(path.toLowerCase()) || strToU8(path).some((byte, i) => byte !== nameBytes[i])) throw new Error('Archive path is unsafe or duplicated.');
    if (bytes > ZIP_LIMITS.maxFileBytes || (path === 'manifest.json' && bytes > ZIP_LIMITS.maxManifestBytes)) throw new Error('Archive entry exceeds safety limits.');
    total += bytes; if (total > ZIP_LIMITS.maxTotalBytes) throw new Error('Archive exceeds the expanded size limit.');
    const local = await exactRead(source, localOffset, 30); const localName = await exactRead(source, localOffset + 30, nameLength);
    if (u32(local, 0) !== 0x04034b50 || u16(local, 6) !== flags || u16(local, 8) !== method || u32(local, 14) !== u32(entry, 16) ||
        u32(local, 18) !== bytes || u32(local, 22) !== bytes || u16(local, 26) !== nameLength || u16(local, 28) !== 0 || localName.some((byte, i) => byte !== nameBytes[i])) throw new Error('Archive local header disagrees with directory.');
    const dataOffset = localOffset + 30 + nameLength; previousEnd = dataOffset + bytes;
    if (previousEnd > centralOffset) throw new Error('Archive payload overlaps its directory.');
    entries.push({ path, bytes, crc32: u32(entry, 16), dataOffset }); names.add(path.toLowerCase()); cursor += 46 + nameLength;
  }
  if (cursor !== centralOffset + centralBytes || previousEnd !== centralOffset || !names.has('manifest.json')) throw new Error('Archive has missing or undeclared data.');
  return entries;
}
export async function extractStoredEntry(source: ZipReader, entry: StoredZipEntry, sink: ZipWriter, options: ZipOperationOptions = {}): Promise<void> {
  let crc = 0xffffffff;
  for (let offset = 0; offset < entry.bytes; offset += 262144) {
    if (offset % 4194304 === 0) await yieldArchiveWork(options.signal);
    checkBackupCancelled(options.signal); const chunk = await exactRead(source, entry.dataOffset + offset, Math.min(262144, entry.bytes - offset));
    checkBackupCancelled(options.signal); crc = updateCrc32(crc, chunk); await sink.write(chunk); options.onProgress?.(offset + chunk.length, 0);
  }
  checkBackupCancelled(options.signal);
  if (((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw new Error('Archive CRC checksum mismatch.');
}
