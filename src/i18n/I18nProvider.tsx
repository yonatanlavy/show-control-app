import { getLocales } from 'expo-localization'
import { createContext, type PropsWithChildren, useContext, useMemo, useState } from 'react'
import { messages, type Locale, type MessageKey } from './messages'

type Params = Readonly<Record<string, string | number>>
interface I18nValue {
  locale: Locale
  isRTL: boolean
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: Params) => string
}

const I18nContext = createContext<I18nValue | null>(null)
const initialLocale = (): Locale => { const candidate = getLocales()[0]?.languageCode; return candidate && candidate in messages ? candidate as Locale : 'en' }

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const value = useMemo<I18nValue>(() => ({
    locale,
    isRTL: locale === 'he' || locale === 'ar',
    setLocale,
    t: (key, params = {}) => Object.entries(params).reduce(
      (text, [name, replacement]) => text.replaceAll(`{${name}}`, String(replacement)),
      messages[locale][key],
    ),
  }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
