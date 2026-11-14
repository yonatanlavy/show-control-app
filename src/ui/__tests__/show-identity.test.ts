import type { AppLocale } from '../../domain'
import { messages, type MessageKey } from '../../i18n'
import { buildShowIdentities, fullShowReference, showIdentityActionName, showIdentityContext } from '../show-identity'

const translate = (locale: AppLocale) => (key: MessageKey) => messages[locale][key]
const make = (id: string, name = 'Evening Show', updatedAt = '2026-11-04T18:30:00.000Z') => ({ id, name, updatedAt })
const uuidA = 'a1234567-1111-4111-8111-111111111111'
const uuidB = 'b1234567-2222-4222-8222-222222222222'

describe('show identity presentation', () => {
  it('distinguishes equal-name/equal-time shows without changing their names or assuming provenance', () => {
    const shows = [make(uuidA), make(uuidB)]; const before = JSON.stringify(shows)
    const labels = buildShowIdentities(shows, 'en', translate('en'))
    expect(labels.get(uuidA)?.reference).toBe('A1234567'); expect(labels.get(uuidB)?.reference).toBe('B1234567')
    expect(labels.get(uuidA)?.context).toContain('Reference'); expect(labels.get(uuidA)?.context).toContain('A1234567')
    expect(labels.get(uuidA)?.actionName).toContain('Evening Show')
    expect(labels.get(uuidA)?.actionName).not.toBe(labels.get(uuidB)?.actionName)
    expect([...labels.values()].map((label) => label.context).join(' ')).not.toMatch(/original|restored|copy|version/i)
    expect(JSON.stringify(shows)).toBe(before)
  })
  it('keeps unique-title actions unchanged and computes references even when context is hidden', () => {
    const labels = buildShowIdentities([make(uuidA, 'Matinee'), make(uuidB, 'Evening')], 'en', translate('en'))
    expect(labels.get(uuidA)).toEqual({ reference: 'A1234567', context: undefined, actionName: 'Matinee' })
    expect(labels.get(uuidB)?.actionName).toBe('Evening')
  })
  it('normalizes only comparison of NFC/case/spacing-equivalent names', () => {
    const shows = [make(uuidA, '  Café   Show '), make(uuidB, 'cafe\u0301 show')]
    const labels = buildShowIdentities(shows, 'en', translate('en'))
    expect(labels.get(uuidA)?.context).toBeDefined(); expect(labels.get(uuidB)?.context).toBeDefined()
    expect(labels.get(uuidA)?.actionName).toContain(shows[0]!.name); expect(labels.get(uuidB)?.actionName).toContain(shows[1]!.name)
  })
  it('extends shared UUID prefixes and keeps references independent of name, time, order and filtering', () => {
    const ids = [uuidA, 'a1234567-1111-4111-8111-222222222222', 'a1234567-1111-4111-8111-333333333333']
    const shows = ids.map((id) => make(id)); const labels = buildShowIdentities(shows, 'en', translate('en'))
    expect(new Set([...labels.values()].map((label) => label.reference)).size).toBe(3)
    expect([...labels.values()].every((label) => label.reference.length > 8)).toBe(true)
    const changed = buildShowIdentities([...shows].reverse().map((show, index) => ({ ...show, name: `Renamed ${index}`, updatedAt: 'invalid' })), 'ar', translate('ar'))
    for (const id of ids) expect(changed.get(id)?.reference).toBe(labels.get(id)?.reference)
    // Callers retain this complete map while filtering rows, rather than rebuilding
    // from the result window and changing reference length as results narrow.
    expect([ids[1]!].map((id) => labels.get(id)?.reference)).toEqual([labels.get(ids[1]!)?.reference])
  })
  it('does not collapse case-only, Unicode-normalization, unsafe or prefix-of-another identities', () => {
    const ids = ['Stage', 'stage', 'é', 'e\u0301', 'show', 'show-longer', '{context}', '\u202Ehidden', '\ud800', '\ud801', 'U-0073', uuidA, uuidA.toUpperCase()]
    const labels = buildShowIdentities(ids.map((id) => make(id)), 'en', translate('en'))
    const refs = [...labels.values()].map((label) => label.reference)
    expect(new Set(refs.map((reference) => reference.toLowerCase())).size).toBe(ids.length)
    expect(refs.every((reference) => /^[A-Za-z0-9_-]+$/.test(reference))).toBe(true)
    expect(refs.join(' ')).not.toMatch(/[{}\u202A-\u202E\u2066-\u2069]/)
  })
  it('resolves prefix-of-another and long case-only encoded collisions across bounded identifier families', () => {
    for (let length = 8; length <= 240; length += 8) {
      const shared = 's'.repeat(length)
      const ids = [shared, shared + '-longer', shared + 'Case', shared + 'case', shared + 'שלט', shared + 'شاشة']
      const labels = buildShowIdentities(ids.map((id) => make(id, 'Same', 'invalid')), 'en', translate('en'))
      const reversed = buildShowIdentities([...ids].reverse().map((id) => make(id, 'Renamed', 'invalid')), 'ar', translate('ar'))
      expect(new Set([...labels.values()].map((label) => label.reference.toLowerCase())).size).toBe(ids.length)
      for (const id of ids) {
        expect(labels.get(id)?.reference).toBe(reversed.get(id)?.reference)
        expect(labels.get(id)?.reference.length).toBeLessThanOrEqual(fullShowReference(id).length)
      }
    }
  })
  it.each(['', 'not a date', '999999-99-99', 'Infinity', '0', '2026-02-30T12:00:00Z', '2025-02-29T12:00:00Z', '2026-01-01T24:00:00Z', '2026-11-04T18:30:00'])('keeps the exact reference when date %j is unavailable', (date) => {
    const labels = buildShowIdentities([make(uuidA, 'Same', date), make(uuidB, 'Same', date)], 'en', translate('en'))
    expect(labels.get(uuidA)?.context).toContain(messages.en['use.library.dateUnavailable'])
    expect(labels.get(uuidA)?.context).toContain('A1234567')
  })
  it.each(['2024-02-29T12:00:00Z', '2024-02-29T12:00:00.123Z', '2024-02-29T12:00:00+02:00', '2024-02-29T12:00:00-0530'])('formats valid unambiguous calendar timestamp %s', (updatedAt) => {
    const context = showIdentityContext(make(uuidA, 'Show', updatedAt), 'A1234567', 'en', translate('en'))
    expect(context).not.toContain(messages.en['use.library.dateUnavailable']); expect(context).toContain('\u2068'); expect(context).toContain('A1234567')
  })
  it('contains Intl failures without hiding the distinguishing reference', () => {
    const format = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new RangeError('Unavailable formatter') })
    try { expect(showIdentityContext(make(uuidA), 'A1234567', 'en', translate('en'))).toContain(messages.en['use.library.dateUnavailable']) } finally { format.mockRestore() }
  })
  it.each(Object.keys(messages) as AppLocale[])('provides complete date/reference/action copy in %s with bidi isolation', (locale) => {
    const labels = buildShowIdentities([make(uuidA, 'מופע العرض'), make(uuidB, 'מופע العرض')], locale, translate(locale))
    const first = labels.get(uuidA)!
    expect(first.context).toContain('\u2066A1234567\u2069'); expect(first.context).toContain('\u2068')
    expect(first.actionName).toContain('מופע العرض'); expect(first.actionName).not.toMatch(/\{(?:name|context|date|reference)\}/)
    expect(first.actionName).not.toBe(labels.get(uuidB)!.actionName)
  })
  it('substitutes templates once, preserving placeholder and replacement-string characters in saved names', () => {
    const name = 'Finale {context} {reference} {name} $& $$'
    const labels = buildShowIdentities([make(uuidA, name), make(uuidB, name)], 'he', translate('he'))
    expect(labels.get(uuidA)?.actionName).toContain(name)
    expect(labels.get(uuidA)?.context).toContain('A1234567')
    expect(showIdentityActionName(name, 'Context {name} $&', translate('he'))).toBe(`${name} · Context {name} $&`)
  })
  it('provides injective complete references for trash without changing active-reference scope', () => {
    const ids = [uuidA, uuidA.toUpperCase(), 'Stage', 'stage', 'שלט', 'شاشة', '\ud800', '\ud801']
    const refs = ids.map(fullShowReference)
    expect(new Set(refs.map((reference) => reference.toLowerCase())).size).toBe(ids.length)
    expect(refs.every((reference) => /^[A-Za-z0-9_-]+$/.test(reference))).toBe(true)
    const active = buildShowIdentities([make(uuidA)], 'en', translate('en'))
    expect(fullShowReference(uuidA)).toContain(active.get(uuidA)!.reference)
    expect(showIdentityContext(make(uuidA), fullShowReference(uuidA), 'en', translate('en'))).toContain(fullShowReference(uuidA))
  })
  it('uses complete references independently of scope for a separately scoped trash collection', () => {
    const shows = [make(uuidA), make(uuidB), make('Stage'), make('stage'), make('مופע')]
    const together = buildShowIdentities(shows, 'en', translate('en'), { fullReferences: true })
    const split = buildShowIdentities([shows[2]!, shows[4]!], 'ar', translate('ar'), { fullReferences: true })
    for (const show of shows) expect(together.get(show.id)?.reference).toBe(fullShowReference(show.id))
    for (const show of [shows[2]!, shows[4]!]) expect(split.get(show.id)?.reference).toBe(together.get(show.id)?.reference)
    expect(buildShowIdentities(shows, 'en', translate('en')).get(uuidA)?.reference).toBe('A1234567')
  })
  it('constructs one date formatter for a large duplicate collection and none for unique titles', () => {
    const original = Intl.DateTimeFormat
    const constructor = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation((locale, options) => new original(locale, options))
    try {
      const shows = Array.from({ length: 1200 }, (_value, index) => make(`show-${index}`))
      const labels = buildShowIdentities(shows, 'en', translate('en'), { fullReferences: true })
      expect(labels.size).toBe(1200); expect(constructor).toHaveBeenCalledTimes(1)
      constructor.mockClear()
      buildShowIdentities(shows.map((show, index) => ({ ...show, name: `Show ${index}` })), 'en', translate('en'))
      expect(constructor).not.toHaveBeenCalled()
    } finally { constructor.mockRestore() }
  })
  it('handles an empty library and repeated snapshots of the same identity without inventing another show', () => {
    expect(buildShowIdentities([], 'en', translate('en')).size).toBe(0)
    const labels = buildShowIdentities([make(uuidA), make(uuidA)], 'en', translate('en'))
    expect(labels.size).toBe(1); expect(labels.get(uuidA)?.context).toBeUndefined()
  })
})
