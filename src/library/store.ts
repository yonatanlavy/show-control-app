import { randomUUID } from 'expo-crypto';
import { Directory } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import ShowAudio from '../../modules/show-audio';
import ShowVisual from '../../modules/show-visual';
import type { AudioCue, ControllerProfile, Cue, Show, VisualAsset } from '../domain';
import { exportLibraryBackup, importLibraryBackup, shareLibraryBackup } from '../storage/backup';
import { committedRestoreReloadError, isCommittedRestoreReloadRequired, type BackupExportOptions, type BackupOptions } from '../storage/backup-progress';
import { MediaImportTransaction, type PickedMedia } from '../storage/contracts';
import { inspectStagedFile } from '../storage/staged-inspection';
import { cleanupAbandonedStaging, ensureLibraryDirectories, ExpoMediaFiles, libraryDirectory, pickMedia, requireFreeSpace } from '../storage/media-files';
import { configureLibraryBusyTimeout, listProfiles, migrateLibrary, portableSettings, readSetting, retryLibraryRead, SqliteMediaRepository, SqlitePromptRepository, SqliteShowRepository, writeSetting } from '../storage/sqlite';
import { checkedName, copyDocument, duplicateSetDocument, duplicateShowDocument, editSet, exactOrder, newAudioCue, newShow, removeCueDocument, revised } from './operations';
import { DEFAULT_LIBRARY_SETTINGS, type AssistantPromptInput, type AssistantPromptRecord, type LibrarySettings, type LibrarySnapshot, type LibraryStore, type RevisionHistoryCursor, type RevisionHistoryPage, type SongImportOptions } from './types';
import { validateLocalShow } from './validate';
import { isCriticalSessionActive } from '../runtime/critical-session-gate';
import { categoryTags, categoryPreset, type MusicCategory } from '../music/categories';
import { copiedLibraryName } from './names';
import { copySongToSection } from '../music/library';
import { validateProfile } from '../controllers/normalize';

const now = () => new Date().toISOString();
// Object key order is not profile meaning. Binding order and every canonical
// identity/command field are meaningful, including unrelated newer mappings.
const profileIdentity = (profile: ControllerProfile): string => JSON.stringify([profile.id, profile.name, profile.bindings.map((binding) => [
  binding.adapterId ?? null, binding.deviceId ?? null, binding.inputKey, binding.command.type, 'cueId' in binding.command ? binding.command.cueId : null,
])]);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const requireIdleLibrary = () => { if (isCriticalSessionActive()) throw new Error('library.armed'); };
const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new Error('Import cancelled.'); requireIdleLibrary(); };
class PersistentLibraryStore implements LibraryStore {
  private snapshot: LibrarySnapshot = freeze({ status: 'loading', saving: false, shows: [], controllerProfiles: [], selectedShowId: null, selectedSetId: null, settings: DEFAULT_LIBRARY_SETTINGS });
  private readonly listeners = new Set<() => void>();
  private db: SQLite.SQLiteDatabase | null = null;
  private initialization: Promise<void> | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  getSnapshot = (): LibrarySnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(value: LibrarySnapshot): void { this.snapshot = freeze(value); this.listeners.forEach((listener) => listener()); }
  private database(): SQLite.SQLiteDatabase { if (!this.db || this.snapshot.status !== 'ready') throw new Error('The library is not ready.'); return this.db; }
  private async readLibrary(db: SQLite.SQLiteDatabase, fallbackSelection: { showId: string | null; setId: string | null }) {
    // Expo query helpers finalize their statements before settling. A failed
    // sibling must not release this batch into close/rollback/reopen while any
    // other helper still owns a native statement or a bounded busy retry.
    const [shows, profiles, preferences, selection] = await Promise.allSettled([
      retryLibraryRead(() => new SqliteShowRepository(db).all()), retryLibraryRead(() => listProfiles(db)),
      retryLibraryRead(() => readSetting(db, 'preferences', DEFAULT_LIBRARY_SETTINGS)),
      retryLibraryRead(() => readSetting(db, 'selection', fallbackSelection)),
    ]);
    const value = <T>(result: PromiseSettledResult<T>): T => { if (result.status === 'rejected') throw result.reason; return result.value; };
    return { shows: value(shows), profiles: value(profiles), preferences: value(preferences), selection: value(selection) };
  }
  clearError = (): void => { if (this.snapshot.status === 'ready' && this.snapshot.error) { const { error: _error, ...value } = this.snapshot; this.publish(value); } };
  initialize = (): Promise<void> => {
    if (this.initialization) return this.initialization;
    const reopeningCommittedRestore = isCommittedRestoreReloadRequired(this.snapshot.error);
    const { error: _previousError, ...previous } = this.snapshot;
    this.publish({ ...previous, status: 'loading', saving: false });
    const initialization = (async () => {
      let db: SQLite.SQLiteDatabase | null = null;
      let recovery: SQLite.SQLiteDatabase | null = null;
      let backupReady = false;
      try {
        // A failed close is retained for a later deliberate retry; never open a
        // second connection over a handle whose cleanup did not finish.
        if (this.db) { await this.db.closeAsync(); this.db = null; }
        ensureLibraryDirectories();
        const directory = libraryDirectory();
        // This store owns its handle. Expo's fast-refresh cache can retain a
        // released handle across activity/bridge recreation; another store's
        // cleanup must not invalidate this store's connection.
        db = await SQLite.openDatabaseAsync('library.db', { useNewConnection: true }, directory.uri); this.db = db;
        const connection = db;
        await configureLibraryBusyTimeout(db); await db.execAsync('PRAGMA foreign_keys = ON');
        const integrity = await retryLibraryRead(() => connection.getFirstAsync<Record<string, string>>('PRAGMA quick_check'));
        const integrityValues = Object.values(integrity ?? {});
        if (integrityValues.length !== 1 || integrityValues[0] !== 'ok') throw new Error('The library database integrity could not be verified. Its original file has been preserved.');
        await migrateLibrary(db, async () => {
          requireFreeSpace(32_000_000);
          recovery = await SQLite.openDatabaseAsync(`migration-${randomUUID()}.db`, {}, new Directory(directory, 'recovery').uri);
          await SQLite.backupDatabaseAsync({ sourceDatabase: connection, sourceDatabaseName: 'main', destDatabase: recovery, destDatabaseName: 'main' });
          backupReady = true;
        });
        const { shows, profiles, preferences, selection } = await this.readLibrary(connection, { showId: null, setId: null });
        const selected = shows.find((show) => show.id === selection.showId) ?? shows[0];
        try { cleanupAbandonedStaging(Date.now(), () => !isCriticalSessionActive()); } catch { /* Cleanup must never block a readable library. */ }
        if (recovery) { await (recovery as SQLite.SQLiteDatabase).closeAsync(); recovery = null; }
        this.publish({ status: 'ready', saving: false, shows, controllerProfiles: profiles, settings: portableSettings(preferences), selectedShowId: selected?.id ?? null,
          selectedSetId: selected?.sets.find((set) => set.id === selection.setId)?.id ?? selected?.sets[0]?.id ?? null });
      } catch (error) {
        let failure = error;
        if (recovery) {
          try { if (backupReady && db) await SQLite.backupDatabaseAsync({ sourceDatabase: recovery, sourceDatabaseName: 'main', destDatabase: db, destDatabaseName: 'main' }); }
          catch { failure = new Error('Library migration recovery failed. The original and recovery files have been preserved.'); }
          finally { await (recovery as SQLite.SQLiteDatabase).closeAsync().catch(() => undefined); }
        }
        if (db) { try { await db.closeAsync(); this.db = null; } catch { /* Retry cleanup before another open. */ } }
        if (reopeningCommittedRestore) failure = committedRestoreReloadError(failure);
        this.publish({ ...this.snapshot, status: 'error', saving: false, error: failure instanceof Error ? failure.message : 'Library could not be opened.' });
        throw failure;
      }
    })();
    this.initialization = initialization.catch((error: unknown) => { this.initialization = undefined; throw error; });
    return this.initialization;
  };
  private serial<T>(work: () => Promise<T>): Promise<T> {
    if (isCriticalSessionActive()) return Promise.reject(new Error('library.armed'));
    const pending = this.queue.then(async () => {
      requireIdleLibrary(); this.database(); const { error: _error, ...current } = this.snapshot; this.publish({ ...current, saving: true });
      try { const result = await work(); const { error: _savedError, ...saved } = this.snapshot; this.publish({ ...saved, saving: false }); return result; }
      catch (error) {
        if (error instanceof Error && error.name === 'AbortError') { const { error: _error, ...previous } = this.snapshot; this.publish({ ...previous, saving: false }); }
        else this.publish({ ...this.snapshot, saving: false, error: error instanceof Error ? error.message : 'The change could not be saved.' });
        throw error;
      }
    });
    this.queue = pending.catch(() => undefined); return pending;
  }
  private show(id: string): Show { const value = this.snapshot.shows.find((show) => show.id === id); if (!value) throw new Error('Show does not exist.'); return value; }
  private async persist(value: Show, prompt?: string, signal?: AbortSignal, restoreDeleted = false, selection?: { readonly setId: string | null }): Promise<Show> {
    const show = revised(value, randomUUID, now);
    validateLocalShow(show, this.snapshot.controllerProfiles);
    cancelled(signal);
    const db = this.database(); const repository = new SqliteShowRepository(db);
    if (selection && selection.setId !== null && !show.sets.some((set) => set.id === selection.setId)) throw new Error('Set does not exist in the selected show.');
    const shows = [show, ...this.snapshot.shows.filter((existing) => existing.id !== show.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const selected = shows.find((candidate) => candidate.id === (selection ? show.id : this.snapshot.selectedShowId)) ?? shows[0];
    const nextSelection = { showId: selected?.id ?? null,
      setId: selection ? selection.setId : selected?.sets.find((set) => set.id === this.snapshot.selectedSetId)?.id ?? selected?.sets[0]?.id ?? null };
    // Save the active show's canonical selection with its revision. Older
    // libraries may still store a deleted playlist ID behind the UI fallback.
    if (selection || show.id === this.snapshot.selectedShowId || nextSelection.showId !== this.snapshot.selectedShowId || nextSelection.setId !== this.snapshot.selectedSetId) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        cancelled(signal); await repository.saveIn(tx, show, prompt);
        if (restoreDeleted) await tx.runAsync('DELETE FROM deleted_shows WHERE id = ?', show.id);
        await writeSetting(tx, 'selection', nextSelection); cancelled(signal);
      });
    } else await repository.save(show, prompt, signal, restoreDeleted, requireIdleLibrary);
    this.publish({ ...this.snapshot, shows, selectedShowId: nextSelection.showId, selectedSetId: nextSelection.setId });
    return copyDocument(show);
  }
  saveShow = (show: Show, prompt?: string, signal?: AbortSignal): Promise<Show> => {
    const candidate = copyDocument(show);
    return this.serial(() => {
      const current = this.snapshot.shows.find((value) => value.id === candidate.id);
      if (current && current.revisionId !== candidate.revisionId) throw new Error('STALE_REVISION');
      return this.persist(candidate, prompt, signal);
    });
  };
  private change(showId: string, edit: (show: Show) => Show, signal?: AbortSignal): Promise<Show> { return this.serial(() => this.persist(edit(copyDocument(this.show(showId))), undefined, signal)); }
  private async persistSelection(showId: string | null, setId?: string): Promise<void> {
    const show = showId === null ? undefined : this.show(showId);
    if (setId && !show?.sets.some((set) => set.id === setId)) throw new Error('Set does not exist in the selected show.');
    const selectedSetId = setId ?? show?.sets[0]?.id ?? null;
    await this.database().withExclusiveTransactionAsync(async (tx) => { requireIdleLibrary(); await writeSetting(tx, 'selection', { showId, setId: selectedSetId }); requireIdleLibrary(); });
    this.publish({ ...this.snapshot, selectedShowId: showId, selectedSetId });
  }
  select = (showId: string | null, setId?: string): Promise<void> => this.serial(() => this.persistSelection(showId, setId));
  createShow = (name: string): Promise<Show> => this.serial(() => { const show = newShow(name, randomUUID, now); return this.persist(show, undefined, undefined, false, { setId: show.sets[0]?.id ?? null }); });
  renameShow = (showId: string, name: string): Promise<Show> => this.change(showId, (show) => ({ ...show, name: checkedName(name) }));
  duplicateShow = (showId: string, name?: string): Promise<Show> => this.serial(() => { const original = this.show(showId); const show = duplicateShowDocument(original, name ?? copiedLibraryName(original.name), randomUUID, now); return this.persist(show, undefined, undefined, false, { setId: show.sets[0]?.id ?? null }); });
  removeShow = (showId: string): Promise<void> => this.serial(async () => {
    this.show(showId); const db = this.database(); const shows = this.snapshot.shows.filter((show) => show.id !== showId);
    const selected = shows.find((show) => show.id === this.snapshot.selectedShowId) ?? shows[0];
    const selection = { showId: selected?.id ?? null, setId: selected?.sets.find((set) => set.id === this.snapshot.selectedSetId)?.id ?? selected?.sets[0]?.id ?? null };
    await db.withExclusiveTransactionAsync(async (tx) => { requireIdleLibrary(); await new SqliteShowRepository(db).deleteIn(tx, showId); await writeSetting(tx, 'selection', selection); requireIdleLibrary(); });
    this.publish({ ...this.snapshot, shows, selectedShowId: selection.showId, selectedSetId: selection.setId });
  });
  trash = (): Promise<readonly Show[]> => new SqliteShowRepository(this.database()).trash();
  restoreDeletedShow = (showId: string): Promise<Show> => this.serial(async () => {
    if (this.snapshot.shows.some((show) => show.id === showId)) throw new Error('Show already exists.');
    const deleted = (await this.trash()).find((show) => show.id === showId); if (!deleted) throw new Error('Deleted show is not available.');
    return this.persist(deleted, 'restore-deleted-show', undefined, true, { setId: deleted.sets[0]?.id ?? null });
  });
  createSet = (showId: string, name: string): Promise<Show> => this.serial(() => { const set = { id: randomUUID(), name: checkedName(name), cueOrder: [], hitCueIds: [], transportMode: 'oms' as const }; return this.persist({ ...this.show(showId), sets: [...this.show(showId).sets, set] }, undefined, undefined, false, { setId: set.id }); });
  renameSet = (showId: string, setId: string, name: string): Promise<Show> => this.change(showId, (show) => editSet(show, setId, (set) => ({ ...set, name: checkedName(name) })));
  setRoutine = (showId: string, setId: string, text: string): Promise<Show> => this.change(showId, (show) => {
    if (text.length > 8192) throw new Error('Routine text is too long');
    return editSet(show, setId, (set) => ({ ...set, routineText: text.trim() }));
  });
  duplicateSet = (showId: string, setId: string, name?: string): Promise<Show> => this.serial(() => { const original = this.show(showId); const set = original.sets.find((value) => value.id === setId); if (!set) throw new Error('Set does not exist.'); const show = duplicateSetDocument(original, setId, name ?? copiedLibraryName(set.name), randomUUID); return this.persist(show, undefined, undefined, false, { setId: show.sets.at(-1)!.id }); });
  removeSet = (showId: string, setId: string): Promise<Show> => this.change(showId, (show) => { if (!show.sets.some((set) => set.id === setId)) throw new Error('Set does not exist.'); return { ...show, sets: show.sets.filter((set) => set.id !== setId) }; });
  reorderSets = (showId: string, setIds: readonly string[]): Promise<Show> => this.change(showId, (show) => ({ ...show, sets: exactOrder(show.sets.map((set) => set.id), setIds).map((id) => show.sets.find((set) => set.id === id)!) }));
  addCue = (showId: string, setId: string, cue: Cue, asHit = false): Promise<Show> => this.change(showId, (show) => {
    if (show.cues[cue.id]) throw new Error('Cue identity already exists.');
    return { ...editSet(show, setId, (set) => asHit ? { ...set, hitCueIds: [...set.hitCueIds, cue.id] } : { ...set, cueOrder: [...set.cueOrder, cue.id] }), cues: { ...show.cues, [cue.id]: copyDocument(cue) } };
  });
  updateCue = (showId: string, cueId: string, changes: Partial<AudioCue>, signal?: AbortSignal): Promise<Show> => this.change(showId, (show) => {
    const cue = show.cues[cueId]; if (!cue || cue.type !== 'audio') throw new Error('Audio cue does not exist.');
    return { ...show, cues: { ...show.cues, [cueId]: { ...cue, ...changes, id: cueId, type: 'audio' } } };
  }, signal);
  duplicateCue = (showId: string, setId: string, cueId: string): Promise<Show> => this.change(showId, (show) => {
    const set = show.sets.find((candidate) => candidate.id === setId); const original = show.cues[cueId];
    if (!set || !original || ![...set.cueOrder, ...set.hitCueIds].includes(cueId)) throw new Error('Cue does not exist in the set.');
    const temporary = { id: randomUUID(), name: 'copy', cueOrder: [cueId], hitCueIds: [] };
    const duplicate = duplicateSetDocument({ ...show, sets: [...show.sets, temporary] }, temporary.id, 'copy', randomUUID);
    const newId = duplicate.sets.at(-1)!.cueOrder[0]!;
    // Cue documents retain their existing 256-character schema bound.
    const copied = { ...duplicate.cues[newId]!, name: copiedLibraryName(original.name, ' copy', 256) };
    return { ...editSet({ ...duplicate, sets: show.sets }, setId, (target) => set.cueOrder.includes(cueId) ? { ...target, cueOrder: [...target.cueOrder, newId] } : { ...target, hitCueIds: [...target.hitCueIds, newId] }), cues: { ...duplicate.cues, [newId]: copied } };
  });
  removeCue = (showId: string, cueId: string): Promise<Show> => this.change(showId, (show) => {
    let changed = removeCueDocument(show, cueId);
    for (;;) { const empty = Object.values(changed.cues).find((cue) => cue.type === 'group' && cue.children.length === 0); if (!empty) return changed; changed = removeCueDocument(changed, empty.id); }
  });
  reorderCues = (showId: string, setId: string, cueIds: readonly string[], asHits = false): Promise<Show> => this.change(showId, (show) => editSet(show, setId, (set) => asHits ? { ...set, hitCueIds: exactOrder(set.hitCueIds, cueIds) } : { ...set, cueOrder: exactOrder(set.cueOrder, cueIds) }));
  copyLibrarySong = (sourceShowId: string, cueId: string, showId: string, setId: string, category?: MusicCategory): Promise<Show> => this.change(showId, (show) => {
    return copySongToSection(show, this.show(sourceShowId), cueId, setId, randomUUID, category);
  });
  importAudio = async (showId: string, setId: string, picked?: PickedMedia, signal?: AbortSignal, options?: SongImportOptions): Promise<Show | null> => {
    const selected = picked ?? await pickMedia('audio/*'); if (!selected) return null;
    return this.serial(async () => {
      const before = this.show(showId);
      if (!before.sets.some((set) => set.id === setId)) throw new Error('DOWNLOAD_TARGET_MISSING');
      if (options?.downloadId && before.sets.find((set) => set.id === setId)?.cueOrder.some((id) => before.cues[id]?.tags.includes(`download:${options.downloadId}`))) return copyDocument(before);
      cancelled(signal); const db = this.database(); const existing = new SqliteMediaRepository(db, requireIdleLibrary);
      // Metadata and cue references commit together in persist; no intermediate visible media row.
      const importer = new MediaImportTransaction(new ExpoMediaFiles(() => cancelled(signal)), existing, () => cancelled(signal));
      const asset = await importer.prepare(selected, signal); cancelled(signal);
      const current = this.show(showId); const fresh = newAudioCue(asset.id, selected.displayName.replace(/\.[^.]+$/, '').slice(0, 200) || 'Audio', randomUUID);
      const cue = { ...fresh, ...(options?.applyPreset && options.category ? categoryPreset(options.category) : {}),
        tags: [...categoryTags(fresh.tags, options?.category ? [options.category] : []), ...(options?.downloadId ? [`download:${options.downloadId}`] : [])],
        ...(options?.notes ? { notes: options.notes.slice(0, 8192) } : {}) };
      const show = { ...editSet(current, setId, (set) => ({ ...set, cueOrder: [...set.cueOrder, cue.id] })), media: { ...current.media, [asset.id]: asset }, cues: { ...current.cues, [cue.id]: cue } };
      return this.persist(show, undefined, signal);
    });
  };
  importVisual = async (showId: string, picked?: PickedMedia, signal?: AbortSignal, imageOnly = false): Promise<VisualAsset | null> => {
    const selected = picked ?? await pickMedia(imageOnly ? 'image/*' : ['image/*', 'video/*']); if (!selected) return null;
    return this.serial(async () => {
      cancelled(signal); this.show(showId); const files = new ExpoMediaFiles(() => cancelled(signal)); const staged = await files.stage(selected.sourceUri);
      try {
        cancelled(signal);
        if (selected.declaredBytes !== undefined && selected.declaredBytes !== staged.bytes) throw new Error('Imported visual file size changed.');
        const { metadata: probe, checksum } = await inspectStagedFile(() => ShowVisual.probeVisual(staged.uri), () => files.sha256(staged.uri), () => cancelled(signal)); cancelled(signal);
        if (imageOnly && probe.kind !== 'image') throw new Error('COVER_IMAGE_REQUIRED');
        const ext = /\.([a-z0-9]{1,8})$/i.exec(selected.displayName)?.[1]?.toLowerCase() ?? (probe.kind === 'image' ? 'png' : 'mp4');
        const committed = await files.commit(staged.uri, `visuals/${checksum}.${ext}`); cancelled(signal);
        const asset: VisualAsset = { id: `visual-${checksum}`, ...probe, checksumSha256: checksum, localUri: committed.uri, bytes: committed.bytes };
        const show = this.show(showId); await this.persist({ ...show, visualAssets: { ...show.visualAssets, [asset.id]: asset } }, undefined, signal); return asset;
      } finally { await files.remove(staged.uri).catch(() => undefined); }
    });
  };
  waveform = (uri: string, buckets = 1024): Promise<readonly number[]> => ShowAudio.waveform(uri, buckets);
  history = (showId: string, cursor?: RevisionHistoryCursor): Promise<RevisionHistoryPage> => new SqliteShowRepository(this.database()).history(showId, cursor);
  restoreRevision = (showId: string, revisionId: string): Promise<Show> => this.serial(async () => { this.show(showId); const revision = await new SqliteShowRepository(this.database()).revision(showId, revisionId); if (!revision) throw new Error('Revision does not exist.'); return this.persist({ ...revision.show, id: showId }, 'restore'); });
  recordPrompt = (showId: string, entry: AssistantPromptInput): Promise<void> => this.serial(() => new SqlitePromptRepository(this.database()).record(showId, entry, randomUUID(), now(), requireIdleLibrary));
  listPrompts = (showId: string): Promise<readonly AssistantPromptRecord[]> => new SqlitePromptRepository(this.database()).list(showId);
  updateSettings = (changes: Partial<LibrarySettings>): Promise<void> => this.serial(async () => { const settings = portableSettings({ ...this.snapshot.settings, ...changes }); await this.database().withExclusiveTransactionAsync(async (tx) => { await configureLibraryBusyTimeout(tx); requireIdleLibrary(); await writeSetting(tx, 'preferences', settings); requireIdleLibrary(); }); this.publish({ ...this.snapshot, settings }); });
  saveControllerProfile = (profile: ControllerProfile, capturedShowId?: string, expectedProfile?: ControllerProfile): Promise<void> => {
    const candidate = copyDocument(profile);
    const expected = expectedProfile ? copyDocument(expectedProfile) : undefined;
    return this.serial(async () => {
      const profiles = [...this.snapshot.controllerProfiles.filter((value) => value.id !== candidate.id), candidate];
      const committed: { show?: Show } = {};
      const db = this.database();
      await db.withExclusiveTransactionAsync(async (tx) => {
        requireIdleLibrary();
        if (expected) {
          const row = await tx.getFirstAsync<{ profile_json: string }>('SELECT profile_json FROM controller_profiles WHERE id = ?', candidate.id);
          if (!row || expected.id !== candidate.id || profileIdentity(JSON.parse(row.profile_json) as ControllerProfile) !== profileIdentity(expected)) throw new Error('STALE_REVISION');
        }
        if (capturedShowId !== undefined) {
          const selected = this.snapshot.shows.find((value) => value.id === capturedShowId);
          if (!selected || this.snapshot.selectedShowId !== capturedShowId || candidate.id !== (selected.controllerProfileId ?? `profile-${selected.id}`)) throw new Error('STALE_REVISION');
          if (!selected.controllerProfileId && validateProfile(candidate).length === 0) {
            committed.show = revised({ ...selected, controllerProfileId: candidate.id }, randomUUID, now);
            validateLocalShow(committed.show, profiles);
          }
        }
        // A completed first profile and its show association are one save.
        // Failure cannot leave testable mappings absent from the prepared show.
        await tx.runAsync('INSERT OR REPLACE INTO controller_profiles (id, profile_json) VALUES (?, ?)', candidate.id, JSON.stringify(candidate));
        requireIdleLibrary();
        if (committed.show) await new SqliteShowRepository(db).saveIn(tx, committed.show);
        requireIdleLibrary();
      });
      const linked = committed.show;
      const shows = linked ? [linked, ...this.snapshot.shows.filter((value) => value.id !== linked.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : this.snapshot.shows;
      this.publish({ ...this.snapshot, controllerProfiles: profiles, shows });
    });
  };
  exportBackup = (options?: BackupExportOptions): Promise<string> => this.serial(() => exportLibraryBackup(this.snapshot, options));
  shareBackup = (uri: string, options?: BackupOptions): Promise<void> => this.serial(() => shareLibraryBackup(uri, options));
  importBackup = (picked?: PickedMedia, options?: BackupOptions): Promise<number | null> => this.serial(async () => {
    const count = await importLibraryBackup(this.database(), picked, requireIdleLibrary, options);
    if (count === null) return null;
    // The transaction already committed. Only reads may retry; an unavailable
    // view must never invite another import or permit stale edits.
    try {
      const db = this.database();
      const { shows, profiles, preferences, selection } = await this.readLibrary(db, { showId: this.snapshot.selectedShowId, setId: this.snapshot.selectedSetId });
      const selected = shows.find((show) => show.id === selection.showId) ?? shows[0];
      this.publish({ ...this.snapshot, shows, controllerProfiles: profiles, settings: portableSettings(preferences), selectedShowId: selected?.id ?? null, selectedSetId: selected?.sets.find((set) => set.id === selection.setId)?.id ?? selected?.sets[0]?.id ?? null });
      return count;
    } catch (cause) {
      const failure = committedRestoreReloadError(cause);
      this.initialization = undefined;
      this.publish({ ...this.snapshot, status: 'error', saving: false, error: failure.message });
      throw failure;
    }
  });
}
export function createLibraryStore(): LibraryStore { return new PersistentLibraryStore(); }
