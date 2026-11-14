import { useMemo } from 'react'
import type { Show } from '../domain'
import { useI18n } from '../i18n'
import { useApp } from './AppProvider'
import { AppText } from './primitives'
import { buildShowIdentities, type ShowIdentity } from './show-identity'

const emptyShows: readonly Show[] = []

/** Identity is derived from the whole active library, never its filtered rows. */
export function useShowIdentities(): ReadonlyMap<string, ShowIdentity> {
  const { libraryState } = useApp()
  const { locale, t } = useI18n()
  const shows = libraryState.status === 'ready' ? libraryState.shows ?? emptyShows : emptyShows
  return useMemo(() => buildShowIdentities(shows, locale, t), [shows, locale, t])
}

/** Reading content may wrap; it never enters the fixed live control layout. */
export function ShowIdentityContext({ identity }: { readonly identity: ShowIdentity | undefined }) {
  return identity?.context ? <AppText tone="caption" muted>{identity.context}</AppText> : null
}
