import type { AudioCue } from '../domain';

// Portable tags avoid a schema migration and keep custom performer tags intact.
export const MUSIC_CATEGORIES = [
  'entrance', 'volunteerArrival', 'volunteerExit', 'transition', 'audienceMixing',
  'concentration', 'choice', 'mindReading', 'drawing', 'memory', 'suspense',
  'danger', 'ritual', 'levitation', 'restoration', 'gambling', 'intimateCards',
  'coins', 'banknotes', 'transformation', 'comedy', 'revelation', 'finale',
  'bows', 'interval', 'ambient',
] as const;
export type MusicCategory = typeof MUSIC_CATEGORIES[number];
export const CATEGORY_PREFIX = 'music-category:';
export function isMusicCategory(value: unknown): value is MusicCategory {
  return typeof value === 'string' && (MUSIC_CATEGORIES as readonly string[]).includes(value);
}
export function songCategories(cue: Pick<AudioCue, 'tags'>): MusicCategory[] {
  const explicit = MUSIC_CATEGORIES.filter((category) => cue.tags.includes(`${CATEGORY_PREFIX}${category}`));
  if (explicit.length || cue.tags.includes('music-categorized')) return explicit;
  const legacy: Readonly<Record<string, MusicCategory>> = {
    entrances: 'entrance', volunteers: 'volunteerArrival', mixing: 'audienceMixing', suspense: 'suspense',
    mentalism: 'mindReading', pressure: 'danger', reveals: 'revelation', wonder: 'levitation',
    'close-playful': 'comedy', 'sleight-groove': 'gambling', emotional: 'restoration', comedy: 'comedy',
    finales: 'finale', 'derren-welcome': 'transition', 'derren-thought': 'concentration',
    'derren-memory': 'memory', 'derren-uncanny': 'ambient', 'derren-ritual': 'ritual',
    'derren-finale': 'finale', 'asi-intimate': 'intimateCards',
  };
  return [...new Set(cue.tags.map((tag) => legacy[tag]).filter((category): category is MusicCategory => !!category))];
}
export function categoryTags(tags: readonly string[], categories: readonly MusicCategory[]): string[] {
  if (categories.some((value) => !isMusicCategory(value))) throw new Error('Invalid song category');
  return [...new Set([...tags.filter((tag) => !tag.startsWith(CATEGORY_PREFIX)), 'music-categorized', ...categories.map((value) => `${CATEGORY_PREFIX}${value}`)])];
}
export const SONG_DEFAULTS = {
  gainDb: -18, fadeInMs: 800, fadeOutMs: 1800, fadeCurve: 'smooth', preWaitMs: 0,
  endBehavior: 'stopAndReadyNext', playbackRate: 1, autoPlay: false, crossfadeEnabled: false, crossfadeMs: 2000,
} as const;
/** Starting points for rehearsal, never loudness guarantees for a room or PA. */
export function categoryPreset(category: MusicCategory): Partial<AudioCue> {
  if (!isMusicCategory(category)) throw new Error('Invalid song category');
  const strong = ['entrance', 'finale', 'bows', 'transformation', 'revelation'].includes(category);
  const quiet = ['choice', 'mindReading', 'drawing', 'memory', 'concentration', 'intimateCards'].includes(category);
  return { ...SONG_DEFAULTS, gainDb: strong ? -9 : quiet ? -24 : -18,
    fadeInMs: category === 'revelation' || category === 'transformation' ? 150 : quiet ? 1200 : 800,
    fadeOutMs: category === 'comedy' ? 500 : quiet ? 2000 : 1800 };
}
