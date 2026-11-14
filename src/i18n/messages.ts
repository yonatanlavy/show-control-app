import type { AppLocale } from '../domain'
import { baseHebrew, english, type MessageKey } from './base-messages'
import { translatedBase, translatedOms } from './catalogues'
import { translatedMusic } from './music-translations'
import { translatedWorkflow } from './workflow-messages'
import { translatedRemote } from './remote-messages'
import { translatedStudio } from './studio-messages'
import { translatedBackup } from './backup-messages'
import { translatedVisual } from './visual-messages'
import { translatedPractice } from './practice-messages'
import { translatedRefinement } from './refinement-messages'
import { usabilityTranslations } from './usability-messages'
import { usabilityLibraryTranslations } from './usability-library-messages'
import { usabilityEditorTranslations } from './usability-editor-messages'
import { usabilityRemoteTranslations } from './usability-remote-messages'
import { backgroundTranslations } from './background-messages'
import { historyTranslations } from './history-messages'
import { edgeTranslations } from './edge-messages'
export type Locale = AppLocale
export type { MessageKey } from './base-messages'
type Catalogue = Record<MessageKey, string>
const existing: Record<Locale, Omit<Catalogue, keyof typeof translatedRemote.he | keyof typeof translatedStudio.he | keyof typeof translatedBackup.he | keyof typeof translatedVisual.he | keyof typeof translatedPractice.he | keyof typeof translatedRefinement.he | keyof typeof usabilityTranslations.he | keyof typeof usabilityLibraryTranslations.he | keyof typeof usabilityEditorTranslations.he | keyof typeof usabilityRemoteTranslations.he | keyof typeof backgroundTranslations.he | keyof typeof historyTranslations.he | keyof typeof edgeTranslations.he>> = {
  en: english, he: { ...baseHebrew, ...translatedOms.he, ...translatedMusic.he, ...translatedWorkflow.he },
  es: { ...translatedBase.es, ...translatedOms.es, ...translatedMusic.es, ...translatedWorkflow.es }, fr: { ...translatedBase.fr, ...translatedOms.fr, ...translatedMusic.fr, ...translatedWorkflow.fr }, de: { ...translatedBase.de, ...translatedOms.de, ...translatedMusic.de, ...translatedWorkflow.de }, it: { ...translatedBase.it, ...translatedOms.it, ...translatedMusic.it, ...translatedWorkflow.it }, pt: { ...translatedBase.pt, ...translatedOms.pt, ...translatedMusic.pt, ...translatedWorkflow.pt }, ru: { ...translatedBase.ru, ...translatedOms.ru, ...translatedMusic.ru, ...translatedWorkflow.ru }, ja: { ...translatedBase.ja, ...translatedOms.ja, ...translatedMusic.ja, ...translatedWorkflow.ja }, ar: { ...translatedBase.ar, ...translatedOms.ar, ...translatedMusic.ar, ...translatedWorkflow.ar },
}
export const messages = Object.fromEntries(Object.entries(existing).map(([locale, dictionary]) => [locale, { ...dictionary, ...(locale === 'en' ? {} : { ...translatedRemote[locale as Exclude<Locale, 'en'>], ...translatedStudio[locale as Exclude<Locale, 'en'>], ...translatedBackup[locale as Exclude<Locale, 'en'>], ...translatedVisual[locale as Exclude<Locale, 'en'>], ...translatedPractice[locale as Exclude<Locale, 'en'>], ...translatedRefinement[locale as Exclude<Locale, 'en'>], ...usabilityTranslations[locale as Exclude<Locale, 'en'>], ...usabilityLibraryTranslations[locale as Exclude<Locale, 'en'>], ...usabilityEditorTranslations[locale as Exclude<Locale, 'en'>], ...usabilityRemoteTranslations[locale as Exclude<Locale, 'en'>], ...backgroundTranslations[locale as Exclude<Locale, 'en'>], ...historyTranslations[locale as Exclude<Locale, 'en'>], ...edgeTranslations[locale as Exclude<Locale, 'en'>] }) }])) as Record<Locale, Catalogue>
