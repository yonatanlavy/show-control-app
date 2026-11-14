import { useRouter } from 'expo-router'
import { type PropsWithChildren, useState } from 'react'
import { View } from 'react-native'
import { radius, size, useThemeColors } from '../design'
import { useI18n, type MessageKey } from '../i18n'
import { AppIcon, type IconName } from './icons'
import { AppShell, AppText, Button, Disclosure, Field, SectionHeader, Surface, TaskRow } from './primitives'

function GuideCard({ title, icon, children, initiallyOpen = false }: PropsWithChildren<{ title: string; icon: IconName; initiallyOpen?: boolean }>) {
  const colors = useThemeColors()
  return <Surface style={{ borderRadius: radius.xl }}><Disclosure title={title} initiallyOpen={initiallyOpen} leading={<View style={{ width: size.control, height: size.control, borderRadius: radius.md, backgroundColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' }}><AppIcon name={icon} tint={colors.accent} /></View>}>{children}</Disclosure></Surface>
}

export function HelpScreen() {
  const { t } = useI18n(); const router = useRouter()
  const [query, setQuery] = useState('')
  const guides: readonly { title: MessageKey; icon: IconName; body: readonly MessageKey[]; actions?: readonly { label: MessageKey; route: string }[] }[] = [
    { title: 'library.title', icon: 'library', body: ['guide.library'], actions: [{ label: 'nav.library', route: '/' }, { label: 'library.playlists', route: '/builder' }] },
    { title: 'editor.title', icon: 'music', body: ['guide.editor'], actions: [{ label: 'nav.builder', route: '/builder' }] },
    { title: 'nav.rehearsal', icon: 'rehearse', body: ['practice.intro', 'practice.silentPrepare'], actions: [{ label: 'practice.prepare', route: '/rehearsal' }] },
    { title: 'nav.run', icon: 'play', body: ['help.body', 'help.playback'], actions: [{ label: 'more.controllers', route: '/controllers' }] },
    { title: 'use.audio.title', icon: 'shield', body: ['use.audio.media', 'use.audio.dnd', 'use.audio.recovery'], actions: [{ label: 'more.preflight', route: '/preflight' }] },
    { title: 'background.help', icon: 'shield', body: ['background.helpBody'], actions: [{ label: 'more.preflight', route: '/preflight' }] },
    { title: 'editor.crossfade', icon: 'next', body: ['help.crossfade'] },
    { title: 'visual.title', icon: 'display', body: ['visual.private', 'audience.precedence'], actions: [{ label: 'audience.refresh', route: '/audience-display' }] },
    { title: 'settings.backup', icon: 'download', body: ['backup.restoreHelp', 'library.rebind'], actions: [{ label: 'more.settings', route: '/settings' }] },
    { title: 'run.guard', icon: 'check', body: ['guide.guard', 'run.unlock'] },
    { title: 'timer.title', icon: 'rehearse', body: ['guide.timer'] },
  ]
  const matches = guides.filter((guide) => [t(guide.title), ...guide.body.map((key) => t(key))].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  return <AppShell current="/more" navigationRoute="/help"><SectionHeader title={t('help.title')} subtitle={t('guide.intro')} /><Field label={t('use.help.search')} value={query} onChange={setQuery} maxLength={256} />{query ? <Button label={t('use.clearSearch')} variant="ghost" onPress={() => setQuery('')} /> : null}
    {!matches.length ? <AppText muted>{t('use.help.noMatches')}</AppText> : matches.map((guide, index) => <GuideCard key={guide.title + Boolean(query.trim())} title={t(guide.title)} icon={guide.icon} initiallyOpen={Boolean(query.trim()) || index === 0}>{guide.body.map((key) => <AppText key={key}>{t(key)}</AppText>)}{guide.actions?.map((action) => <TaskRow key={action.route} label={t(action.label)} onPress={() => router.push(action.route as never)} />)}</GuideCard>)}
    <Disclosure title={t('setup.optional')}><Surface><AppText>{t('voice.permission')}</AppText><AppText>{t('ai.keyHelp')}</AppText><AppText>{t('ai.cancelHelp')}</AppText></Surface></Disclosure>
  </AppShell>
}
