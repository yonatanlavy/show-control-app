import type { AppLocale, AudioCue, ControllerProfile, Cue, Show, StageTheme, VisualAsset } from '../domain';
import type { PickedMedia } from '../storage/contracts';
import type { MusicCategory } from '../music/categories';
import type { BackupExportOptions, BackupOptions } from '../storage/backup-progress';

export interface SongImportOptions { readonly category?: MusicCategory; readonly downloadId?: string; readonly notes?: string; readonly applyPreset?: boolean }

export interface LibrarySettings {
  readonly locale: AppLocale;
  readonly theme: StageTheme;
  readonly onboardingCompleted: boolean;
  readonly externalDisplayEnabled: boolean;
  readonly voiceModel: 'base' | 'small';
  readonly assistantProvider: 'openai' | 'anthropic';
  readonly assistantModel: string;
  readonly artworkModel: string;
  readonly musicModel: string;
}
export const DEFAULT_LIBRARY_SETTINGS: LibrarySettings = {
  locale: 'en', theme: 'darkBlue', onboardingCompleted: false, externalDisplayEnabled: false,
  voiceModel: 'base', assistantProvider: 'openai', assistantModel: 'gpt-5.6-terra',
  artworkModel: 'gpt-image-2.5-flare', musicModel: 'music_v2_5',
};
export interface LibrarySnapshot {
  readonly status: 'loading' | 'ready' | 'error';
  readonly saving: boolean;
  readonly shows: readonly Show[];
  readonly controllerProfiles: readonly ControllerProfile[];
  readonly selectedShowId: string | null;
  readonly selectedSetId: string | null;
  readonly settings: LibrarySettings;
  readonly error?: string;
}
export interface ShowRevisionSummary {
  readonly id: string;
  readonly createdAt: string;
  readonly prompt?: string;
}
export interface ShowRevision extends ShowRevisionSummary {
  readonly show: Show;
}
export interface RevisionHistoryCursor { readonly createdAt: string; readonly id: string }
export interface RevisionHistoryPage {
  readonly revisions: readonly ShowRevisionSummary[];
  readonly nextCursor: RevisionHistoryCursor | null;
}
export const REVISION_HISTORY_PAGE_SIZE = 20;
export type AssistantPromptKind = 'answer' | 'clarification' | 'edit' | 'generateArtwork' | 'generateMusic';
export interface AssistantPromptInput {
  readonly prompt: string;
  readonly response: string;
  readonly kind: AssistantPromptKind;
  readonly beforeRevisionId?: string;
}
export interface AssistantPromptRecord extends AssistantPromptInput {
  readonly id: string;
  readonly createdAt: string;
}
export interface LibraryStore {
  getSnapshot(): LibrarySnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  clearError(): void;
  saveShow(show: Show, prompt?: string, signal?: AbortSignal): Promise<Show>;
  select(showId: string | null, setId?: string): Promise<void>;
  createShow(name: string): Promise<Show>;
  renameShow(showId: string, name: string): Promise<Show>;
  duplicateShow(showId: string, name?: string): Promise<Show>;
  removeShow(showId: string): Promise<void>;
  trash(): Promise<readonly Show[]>;
  restoreDeletedShow(showId: string): Promise<Show>;
  createSet(showId: string, name: string): Promise<Show>;
  renameSet(showId: string, setId: string, name: string): Promise<Show>;
  setRoutine(showId: string, setId: string, text: string): Promise<Show>;
  duplicateSet(showId: string, setId: string, name?: string): Promise<Show>;
  removeSet(showId: string, setId: string): Promise<Show>;
  reorderSets(showId: string, setIds: readonly string[]): Promise<Show>;
  addCue(showId: string, setId: string, cue: Cue, asHit?: boolean): Promise<Show>;
  updateCue(showId: string, cueId: string, changes: Partial<AudioCue>, signal?: AbortSignal): Promise<Show>;
  duplicateCue(showId: string, setId: string, cueId: string): Promise<Show>;
  removeCue(showId: string, cueId: string): Promise<Show>;
  reorderCues(showId: string, setId: string, cueIds: readonly string[], asHits?: boolean): Promise<Show>;
  importAudio(showId: string, setId: string, picked?: PickedMedia, signal?: AbortSignal, options?: SongImportOptions): Promise<Show | null>;
  copyLibrarySong(sourceShowId: string, cueId: string, showId: string, setId: string, category?: MusicCategory): Promise<Show>;
  importVisual(showId: string, picked?: PickedMedia, signal?: AbortSignal, imageOnly?: boolean): Promise<VisualAsset | null>;
  waveform(mediaUri: string, buckets?: number): Promise<readonly number[]>;
  history(showId: string, cursor?: RevisionHistoryCursor): Promise<RevisionHistoryPage>;
  restoreRevision(showId: string, revisionId: string): Promise<Show>;
  recordPrompt(showId: string, entry: AssistantPromptInput): Promise<void>;
  listPrompts(showId: string): Promise<readonly AssistantPromptRecord[]>;
  updateSettings(changes: Partial<LibrarySettings>): Promise<void>;
  saveControllerProfile(profile: ControllerProfile, capturedShowId?: string, expectedProfile?: ControllerProfile): Promise<void>;
  exportBackup(options?: BackupExportOptions): Promise<string>;
  shareBackup(uri: string, options?: BackupOptions): Promise<void>;
  importBackup(picked?: PickedMedia, options?: BackupOptions): Promise<number | null>;
}
