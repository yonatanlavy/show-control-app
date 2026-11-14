import { createContext, useContext } from 'react'
import type { MessageKey } from '../i18n'
import { isCommittedRestoreReloadRequired } from '../storage/backup-progress'

export interface TaskFeedback { readonly id: number; readonly message: MessageKey; readonly undo?: (() => Promise<unknown>) | undefined }
export interface FeedbackOptions { readonly message?: MessageKey; readonly undo?: (() => Promise<unknown>) | undefined; readonly silent?: boolean }
export interface TaskFailure { readonly detail: string; readonly busy: boolean; readonly retry: () => void; readonly dismiss?: (() => void) | undefined }
export const FeedbackContext = createContext<{ feedback: TaskFeedback | null; dismiss: () => void; undo: () => void; failure?: TaskFailure | null }>({ feedback: null, dismiss: () => undefined, undo: () => undefined })
export const useTaskFeedback = () => useContext(FeedbackContext)

export const controllerReviewRoute = { pathname: '/controllers', params: { section: 'buttons' } } as const
export function isControllerRepairError(error: string): boolean {
  // Native refresh details cannot turn a committed mapping edit into a retry.
  if (/^CONTROLLER_SETUP_FAILED\b/.test(error)) return true
  if (isCommittedRestoreReloadRequired(error) || /archive|manifest|\.showbundle|\bZIP\b|backup/i.test(error)) return false
  return /\bCONTROLLER_(?:INVALID|MISSING|SETUP_FAILED)\b|selected controller profile|controller profile IDs must be unique/i.test(error)
}
export function taskRetryKey(error: string): MessageKey {
  return isCommittedRestoreReloadRequired(error) ? 'backup.reopenLibrary' : isControllerRepairError(error) ? 'remote.reviewButtons' : /STALE_REVISION/.test(error) ? 'error.review' : 'common.retry'
}
export function operationErrorKey(error: string): MessageKey {
  if (isCommittedRestoreReloadRequired(error)) return 'backup.reopenHelp'
  if (/TRANSITION_REFUSED|RECOVERABLE_REFUSAL/.test(error)) return 'practice.transitionRefused'
  if (/TRANSPORT_FAILED/.test(error)) return 'background.transportFailed'
  if (/SYSTEM_AUDIO_SUPPRESSED|system_media_muted|dnd_filter_changed/.test(error)) return 'use.audio.suppressed'
  if (/AUDIO_INTERRUPTED|AUDIO_SESSION_INTERRUPTED|audio_focus|audio_session_began|phone_call|preview.*interrupt/i.test(error)) return 'use.audio.interrupted'
  if (/\bSQLITE_(?:BUSY|LOCKED)(?:_[A-Z0-9]+)*\b|\bdatabase(?: table| schema)? is (?:locked|busy)\b/i.test(error)) return 'error.databaseBusy'
  if (/COVER_IMAGE_REQUIRED/.test(error)) return 'studio.imageRequired'
  if (/probeVisual|unsupported.*(?:image|video)|image cannot be decoded/i.test(error)) return 'error.visualUnreadable'
  if (/REMOTE_SETUP_ARMED/.test(error)) return 'remote.armed'
  if (/REMOTE_INPUT_EXPIRED/.test(error)) return 'remote.expired'
  if (/REMOTE_PROFILE_FULL/.test(error)) return 'remote.capacity'
  if (/REMOTE_PERMISSION_DENIED|E_BLUETOOTH_PERMISSION|Nearby.device|Bluetooth permission/.test(error)) return 'remote.permissions'
  if (/E_FLIC_PAIR|Flic pairing|Flic state|flic2lib|Flic.*SDK/i.test(error)) return 'remote.flicGuide'
  if (/DOWNLOAD_URL/.test(error)) return 'error.downloadUrl'
  if (/DOWNLOAD_RUNTIME_MISSING/.test(error)) return 'error.downloadRuntime'
  if (/DOWNLOAD_HELPER_/.test(error)) return 'error.downloadHelper'
  if (/DOWNLOAD_(BUSY|HISTORY_FULL)/.test(error)) return 'error.downloadBusy'
  if (/DOWNLOAD_(SIZE|TIMEOUT)/.test(error)) return 'error.downloadSize'
  if (/DOWNLOAD_STORAGE/.test(error)) return 'error.lowStorage'
  if (/DOWNLOAD_INTERRUPTED/.test(error)) return 'error.downloadInterrupted'
  if (/DOWNLOAD_TARGET_MISSING/.test(error)) return 'finder.targetMissing'
  if (/DOWNLOAD_/.test(error)) return 'error.downloadFailed'
  if (/MUSIC_AI_KEY/.test(error)) return 'error.musicKey'
  if (/MUSIC_AI_QUOTA/.test(error)) return 'error.musicQuota'
  if (/MUSIC_AI_OFFLINE/.test(error)) return 'error.musicOffline'
  if (/MUSIC_(AI_INVALID|AI_FAILED|ROUTINE_INVALID)/.test(error)) return 'error.musicInvalid'
  if (/CAPACITY_REFUSAL/.test(error)) return 'run.capacityWarning'
  if (/ROUTE_CHANGE/.test(error)) return 'run.routeWarning'
  if (/PLAYBACK_FAULT|NATIVE_SESSION_LOST|NATIVE_STATE_UNAVAILABLE/.test(error)) return 'run.playbackWarning'
  if (/CONTROLLER_SETUP_FAILED/.test(error)) return 'controllers.touchFallback'
  if (isControllerRepairError(error)) return 'error.controllerRepair'
  if (/STALE_REVISION/.test(error)) return 'error.staleRevision'
  if (/library\.armed/.test(error)) return 'editor.previewSafety'
  if (/ENOSPC|low.*storage|free.*space|disk.*space|not enough(?: free)? storage/i.test(error)) return 'error.lowStorage'
  if (/declared file size is invalid|media is empty|file size (?:is invalid|changed)|file is empty/i.test(error)) return 'error.mediaSize'
  if (/secure.?store|keychain|keystore|KEY_READ/i.test(error)) return 'error.keys'
  if (/PREVIEW_FAILED|probeMedia|extractor|decode|unsupported.*audio|no.*audio.*track/i.test(error)) return 'error.mediaUnreadable'
  if (/archive|manifest|checksum|\.showbundle|\bZIP\b|backup.*(invalid|unsupported)/i.test(error)) return 'error.backupInvalid'
  if (/local.*(file|media)|unsupported.*(URL|URI)|scheme|app.owned|outside.*storage|http[s]?:|javascript:/i.test(error)) return 'error.localMedia'
  if (/invalid.*(number|time|rule)|NaN|numeric|out.of.range/i.test(error)) return 'common.invalidValue'
  return error === 'editor.previewSafety' ? 'editor.previewSafety' : 'common.errorHelp'
}
