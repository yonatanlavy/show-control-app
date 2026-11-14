/** Keep a staged file owned until every started native reader has settled.
 * Capture synchronous bridge failures too; a rejected sibling must not cause
 * cleanup while another reader still uses the file. This does not cancel OS I/O.
 */
export async function inspectStagedFile<Metadata>(readMetadata: () => Promise<Metadata>, readChecksum: () => Promise<string>, checkCurrent: () => void = () => undefined) {
  checkCurrent();
  const read = <T>(reader: () => Promise<T>) => Promise.resolve().then(() => { checkCurrent(); return reader(); });
  const [metadata, checksum] = await Promise.allSettled([read(readMetadata), read(readChecksum)]);
  checkCurrent();
  if (metadata.status === 'rejected') throw metadata.reason;
  if (checksum.status === 'rejected') throw checksum.reason;
  return { metadata: metadata.value, checksum: checksum.value };
}
