import type { AppLocale, Show } from '../domain'
import type { MessageKey } from '../i18n'

type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string
type ShowSource = Pick<Show, 'id' | 'name' | 'updatedAt'>
export interface ShowIdentity { readonly reference: string; readonly context?: string | undefined; readonly actionName: string }
export interface ShowIdentityOptions { readonly fullReferences?: boolean }
type Reference = { readonly id: string; prefix: string; value: string; length: number }

// New local identities use lowercase UUIDs. Other namespaces cannot collide
// with their hex-only references, including case variants of that same UUID.
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const ascii = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
function encoded(id: string): string {
  let value = ''
  // Fixed-width UTF-16 encoding remains injective for lone surrogates too, and
  // never displays untrusted bidi controls, braces or lookalike Unicode IDs.
  for (let index = 0; index < id.length; index += 1) value += id.charCodeAt(index).toString(16).padStart(4, '0').toUpperCase()
  return value
}
/** Complete, scope-independent identity for a separately scoped trash item. */
export function fullShowReference(id: string): string { return uuid.test(id) ? id.replaceAll('-', '').toUpperCase() : `U-${encoded(id)}` }

function references(ids: readonly string[]): ReadonlyMap<string, string> {
  const values: Reference[] = [...new Set(ids)].map((id) => uuid.test(id)
    ? { id, prefix: '', value: id.replaceAll('-', '').toUpperCase(), length: 8 }
    : ascii.test(id) ? { id, prefix: 'R-', value: id, length: Math.min(8, id.length) }
      : { id, prefix: 'U-', value: encoded(id), length: Math.min(8, id.length * 4) })
  const group = (key: (entry: Reference) => string) => {
    const groups = new Map<string, Reference[]>()
    for (const entry of values) { const value = key(entry).toLowerCase(); const peers = groups.get(value) ?? []; peers.push(entry); groups.set(value, peers) }
    return [...groups.values()].filter((peers) => peers.length > 1)
  }
  // A longer raw prefix cannot distinguish case-only legacy identities. Their
  // encoded namespaces retain the difference before abbreviation is considered.
  for (const peers of group((entry) => entry.prefix + entry.value)) for (const entry of peers) {
    entry.prefix = 'U-'; entry.value = encoded(entry.id); entry.length = Math.min(8, entry.value.length)
  }
  let collisions = group((entry) => entry.prefix + entry.value.slice(0, entry.length))
  while (collisions.length) {
    for (const peers of collisions) for (const entry of peers) entry.length = Math.min(entry.value.length, entry.length + 4)
    collisions = group((entry) => entry.prefix + entry.value.slice(0, entry.length))
  }
  return new Map(values.map((entry) => [entry.id, entry.prefix + entry.value.slice(0, entry.length)]))
}

// User names may themselves contain literal {context}, $& or similar text.
// Substitute each template once, never re-process inserted data.
function format(t: Translate, key: MessageKey, params: Readonly<Record<string, string>>): string {
  return t(key).replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder)
}
export function showIdentityActionName(name: string, context: string, t: Translate): string {
  return format(t, 'use.library.identityAction', { name, context })
}
function timestamp(value: string): number | null {
  // Date.parse alone normalizes impossible days and accepts ambiguous values
  // such as "0". Display only explicit, valid ISO calendar timestamps.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-](\d{2}):?(\d{2}))$/i.exec(value)
  if (!parts) return null
  const year = Number(parts[1]); const month = Number(parts[2]); const day = Number(parts[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > (days[month - 1] ?? 0) || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59 ||
      (parts[8]!.toUpperCase() !== 'Z' && (Number(parts[9]) > 23 || Number(parts[10]) > 59))) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
function dateFormatter(locale: AppLocale): Intl.DateTimeFormat | null {
  try { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return null }
}
function identityContext(show: Pick<Show, 'updatedAt'>, reference: string, t: Translate, formatter: () => Intl.DateTimeFormat | null): string {
  let date = t('use.library.dateUnavailable')
  try {
    const value = timestamp(show.updatedAt); const available = value === null ? null : formatter()
    if (value !== null && available) date = format(t, 'use.library.identityUpdated', { date: `\u2068${available.format(value)}\u2069` })
  } catch { /* An unavailable formatter/date cannot hide the exact reference. */ }
  return format(t, 'use.library.identityContext', { date, reference: `\u2066${reference}\u2069` })
}
/** Localized reading context only; this does not change stored show metadata. */
export function showIdentityContext(show: Pick<Show, 'updatedAt'>, reference: string, locale: AppLocale, t: Translate): string {
  return identityContext(show, reference, t, () => dateFormatter(locale))
}

/** Build once from the complete active library, then look up filtered rows. */
export function buildShowIdentities(shows: readonly ShowSource[], locale: AppLocale, t: Translate, options: ShowIdentityOptions = {}): ReadonlyMap<string, ShowIdentity> {
  const refs = options.fullReferences ? new Map(shows.map((show) => [show.id, fullShowReference(show.id)])) : references(shows.map((show) => show.id))
  const names = new Map<string, Set<string>>()
  const nameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase()
  for (const show of shows) { const key = nameKey(show.name); const ids = names.get(key) ?? new Set<string>(); ids.add(show.id); names.set(key, ids) }
  let formatter: Intl.DateTimeFormat | null | undefined
  const getFormatter = () => { if (formatter === undefined) formatter = dateFormatter(locale); return formatter }
  return new Map(shows.map((show) => {
    const reference = refs.get(show.id)!
    const context = names.get(nameKey(show.name))!.size > 1 ? identityContext(show, reference, t, getFormatter) : undefined
    return [show.id, { reference, context, actionName: context ? showIdentityActionName(show.name, context, t) : show.name }]
  }))
}
