import type { AudioCue, MediaAsset, Show, VisualAsset } from '../domain';
import { categoryTags, songCategories, type MusicCategory } from './categories';
import { copyDocument, editSet, type IdFactory } from '../library/operations';
export interface LibrarySong {
  readonly id: string; readonly showId: string; readonly cueId: string; readonly name: string;
  readonly categories: readonly MusicCategory[]; readonly durationMs: number; readonly cue: AudioCue;
}
/** One representative per immutable file; settings in each show remain independent. */
export function librarySongs(shows: readonly Show[]): LibrarySong[] {
  const songs = new Map<string, LibrarySong>();
  for (const show of shows) for (const cue of Object.values(show.cues)) {
    if (cue.type !== 'audio') continue;
    const asset = show.media[cue.mediaAssetId]; if (!asset) continue;
    const contentId = asset.checksumSha256.toLowerCase(); const previous = songs.get(contentId);
    const categories = [...new Set([...(previous?.categories ?? []), ...songCategories(cue)])];
    songs.set(contentId, previous ? { ...previous, categories } : {
      id: contentId, showId: show.id, cueId: cue.id, name: cue.name, categories, durationMs: asset.durationMs, cue,
    });
  }
  return [...songs.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function filterLibrarySongs(songs: readonly LibrarySong[], query: string, category?: MusicCategory): LibrarySong[] {
  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return songs.filter((song) => (!category || song.categories.includes(category)) && words.every((word) => song.name.normalize('NFKC').toLocaleLowerCase().includes(word)));
}
/** Reconcile identifiers rather than overwriting media already referenced by a show. */
export function copySongToSection(show: Show, source: Show, cueId: string, setId: string, id: IdFactory, category?: MusicCategory): Show {
  const original = source.cues[cueId]; if (original?.type !== 'audio') throw new Error('Library song is no longer available');
  const sourceAudio = source.media[original.mediaAssetId]; if (!sourceAudio) throw new Error('Library song is no longer available');
  const importAsset = <T extends MediaAsset | VisualAsset>(asset: T, existing: Readonly<Record<string, T>>): T => {
    const same = Object.values(existing).find((value) => value.checksumSha256 === asset.checksumSha256 && value.bytes === asset.bytes);
    if (same) return copyDocument(same);
    let assetId = asset.id; while (existing[assetId]) assetId = id();
    return { ...copyDocument(asset), id: assetId };
  };
  const audio = importAsset(sourceAudio, show.media); const visuals = { ...show.visualAssets };
  const copied = { ...copyDocument(original), id: id(), mediaAssetId: audio.id,
    ...(category ? { tags: categoryTags(original.tags, [category]) } : {}) };
  for (const key of ['artworkAssetId', 'visualAssetId'] as const) {
    const assetId = original[key]; if (!assetId) continue;
    const asset = source.visualAssets?.[assetId]; if (!asset) throw new Error('Library visual is no longer available');
    const visual = importAsset(asset, visuals); visuals[visual.id] = visual; copied[key] = visual.id;
  }
  return { ...editSet(show, setId, (set) => ({ ...set, cueOrder: [...set.cueOrder, copied.id] })), cues: { ...show.cues, [copied.id]: copied },
    media: { ...show.media, [audio.id]: audio }, visualAssets: visuals,
    voiceRules: [...(show.voiceRules ?? []), ...(source.voiceRules ?? []).filter((rule) => rule.cueId === cueId && (rule.action.type !== 'PLAY' || rule.action.cueId === cueId)).map((rule) => ({
      ...copyDocument(rule), id: id(), cueId: copied.id,
      action: rule.action.type === 'PLAY' && rule.action.cueId === cueId ? { ...rule.action, cueId: copied.id } : rule.action,
    }))] };
}
