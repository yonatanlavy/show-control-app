/** Authoring bound; existing imported documents retain their own schema bounds. */
export const LIBRARY_NAME_MAX_LENGTH = 200;

export function checkedName(name: string): string {
  const normalized = name.trim().normalize('NFC');
  if (!normalized || normalized.length > LIBRARY_NAME_MAX_LENGTH) throw new Error(`A name between 1 and ${LIBRARY_NAME_MAX_LENGTH} characters is required.`);
  return normalized;
}

export function validLibraryName(name: string): boolean {
  const normalized = name.trim().normalize('NFC');
  return normalized.length > 0 && normalized.length <= LIBRARY_NAME_MAX_LENGTH;
}

/** Only automatically generated copy names shorten a prefix to retain their suffix. */
export function copiedLibraryName(name: string, suffix = ' copy', maxLength = LIBRARY_NAME_MAX_LENGTH): string {
  const normalized = name.trim().normalize('NFC');
  const ending = suffix.normalize('NFC');
  const available = maxLength - ending.length;
  if (!normalized || !ending.trim() || !Number.isSafeInteger(maxLength) || maxLength > 256 || available < 1) throw new Error('Invalid copy name.');
  let prefix = '';
  for (const character of normalized) {
    if (prefix.length + character.length > available) break;
    prefix += character;
  }
  if (!prefix) throw new Error('Invalid copy name.');
  return (prefix.trimEnd() + ending).trim();
}
