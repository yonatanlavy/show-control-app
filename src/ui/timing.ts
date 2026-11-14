export function sourceClock(milliseconds: number) {
  const value = Math.max(0, Math.round(milliseconds))
  return `${Math.floor(value / 60000)}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`
}

/** User-entered seconds, with common decimal keyboards and Arabic/Persian digits. */
export function parseSeconds(text: string): number | null {
  const clean = text.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - (digit <= '\u0669' ? 0x0660 : 0x06f0))).replace(/[,\u066b]/g, '.')
  if (!/^(?:\d+(?:\.\d{1,3})?|\.\d{1,3})$/.test(clean)) return null
  const value = Math.round(Number(clean) * 1000)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}
