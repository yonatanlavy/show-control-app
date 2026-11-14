import { sampleShow, type AudioCue, type Show } from '../../src/domain';
import { newAudioCue, newShow, duplicateSetDocument, upgradeShowDocument } from '../../src/library/operations';
import { validateLocalShow } from '../../src/library/validate';
import { MUSIC_CATEGORIES, categoryPreset, categoryTags, songCategories } from '../../src/music/categories';
import { copySongToSection, filterLibrarySongs, librarySongs } from '../../src/music/library';
import { validateMusicRecommendations } from '../../src/ai/music-recommendations';

let next = 0; const id = () => 'song-copy-' + ++next;
const audio = sampleShow.cues.bed as AudioCue;
const songs = librarySongs([sampleShow]); const song = songs[0]!;
const suggestion = { source: 'library', libraryId: song.id, title: 'provider title', artist: '', searchQuery: null, category: 'ambient', reason: 'Fits speech.', start: 'After the introduction.', stop: 'Before the decision.' };
const plan = () => ({ summary: 'Keep speech clear.', clarification: null, choices: [], suggestions: [{ ...suggestion }] });
describe('routine music, defaults and portable roles', () => {
  it('provides at least twenty roles and quiet manual defaults', () => {
    expect(new Set(MUSIC_CATEGORIES).size).toBeGreaterThanOrEqual(20);
    expect(newAudioCue('audio', 'Speech bed', id)).toMatchObject({ gainDb: -18, fadeInMs: 800, fadeOutMs: 1800, playbackRate: 1, preWaitMs: 0, autoPlay: false, crossfadeEnabled: false, endBehavior: 'stopAndReadyNext', crossfadeMs: 2000 });
    for (const category of MUSIC_CATEGORIES) expect(categoryPreset(category)).toMatchObject({ autoPlay: false, crossfadeEnabled: false, playbackRate: 1, preWaitMs: 0, endBehavior: 'stopAndReadyNext' });
    expect(categoryPreset('choice').gainDb).toBeLessThan(categoryPreset('entrance').gainDb!);
  });
  it('preserves custom tags and clears inferred legacy categories', () => {
    expect(songCategories({ tags: ['derren-memory'] })).toEqual(['memory']);
    const tags = categoryTags(['derren-memory', 'custom'], ['coins', 'coins', 'comedy']);
    expect(tags).toContain('custom'); expect(songCategories({ tags })).toEqual(['coins', 'comedy']);
    expect(songCategories({ tags: categoryTags(['derren-memory'], []) })).toEqual([]);
    expect(() => categoryTags([], ['invented'] as never)).toThrow();
  });
  it('keeps tuning during migration and duplicates bounded routine text', () => {
    const show: Show = { ...sampleShow, sets: sampleShow.sets.map((set) => ({ ...set, routineText: 'Intimate drawing duplication.' })) };
    expect(upgradeShowDocument(show).cues.bed).toMatchObject({ gainDb: audio.gainDb, fadeInMs: audio.fadeInMs });
    expect(duplicateSetDocument(show, show.sets[0]!.id, 'Copy', id).sets.at(-1)!.routineText).toBe(show.sets[0]!.routineText);
    expect(() => validateLocalShow({ ...show, sets: [{ ...show.sets[0]!, routineText: 'x'.repeat(8193) }] })).toThrow();
  });
  it('deduplicates media and filters Unicode titles and categories', () => {
    const second: Show = { ...sampleShow, id: 'second', cues: { ...sampleShow.cues, bed: { ...audio, tags: categoryTags([], ['memory']), name: 'Ｃａｆｅ Memory' } } };
    const deduped = librarySongs([second, sampleShow]);
    expect(deduped).toHaveLength(songs.length);
    expect(filterLibrarySongs(deduped, 'cafe memory', 'memory')).toHaveLength(1);
    expect(filterLibrarySongs(deduped, 'not a real song')).toEqual([]);
  });
  it('copies settings independently and never replaces a conflicting destination media ID', () => {
    const target = { ...newShow('Target', id, () => '2026-10-14T00:00:00Z'), media: { [audio.mediaAssetId]: { ...sampleShow.media[audio.mediaAssetId]!, checksumSha256: 'f'.repeat(64) } } };
    const result = copySongToSection(target, sampleShow, audio.id, target.sets[0]!.id, id, 'mindReading');
    const copied = result.cues[result.sets[0]!.cueOrder[0]!] as AudioCue;
    expect(result.media[audio.mediaAssetId]!.checksumSha256).toBe('f'.repeat(64)); expect(copied.mediaAssetId).not.toBe(audio.mediaAssetId);
    expect(result.media[copied.mediaAssetId]!.localUri).toBe(sampleShow.media[audio.mediaAssetId]!.localUri);
    expect(copied).not.toBe(audio); expect(copied.gainDb).toBe(audio.gainDb); expect(sampleShow.cues[audio.id]!.tags).toEqual(audio.tags);
  });
  it('rejects vanished sources/sections and reuses identical media under another ID', () => {
    const target = newShow('Target', id, () => '2026-10-14T00:00:00Z');
    expect(() => copySongToSection(target, sampleShow, 'gone', target.sets[0]!.id, id)).toThrow();
    expect(() => copySongToSection(target, sampleShow, audio.id, 'gone', id)).toThrow();
    const asset = sampleShow.media[audio.mediaAssetId]!;
    const result = copySongToSection({ ...target, media: { shared: { ...asset, id: 'shared' } } }, sampleShow, audio.id, target.sets[0]!.id, id);
    expect(Object.keys(result.media)).toEqual(['shared']);
  });
});
describe('recommendation boundary', () => {
  it('canonicalizes the library title', () => { expect(validateMusicRecommendations(plan(), songs).suggestions[0]!.title).toBe(song.name); });
  it('rejects invented library IDs', () => { const value = plan(); value.suggestions[0]!.libraryId = 'f'.repeat(64); expect(() => validateMusicRecommendations(value, songs)).toThrow('MUSIC_AI_INVALID'); });
  it('rejects duplicate recommendations', () => { const value = plan(); value.suggestions.push({ ...suggestion }); expect(() => validateMusicRecommendations(value, songs)).toThrow(); });
  it('rejects a download query on a library result', () => { expect(() => validateMusicRecommendations({ ...plan(), suggestions: [{ ...suggestion, searchQuery: 'Song artist' }] }, songs)).toThrow(); });
  it('accepts outside search terms but rejects URLs, transport and code', () => {
    const outside = { ...suggestion, source: 'search', libraryId: null, title: 'New title', searchQuery: 'New title artist' };
    expect(validateMusicRecommendations({ ...plan(), suggestions: [outside] }, songs).suggestions[0]!.source).toBe('search');
    expect(() => validateMusicRecommendations({ ...plan(), suggestions: [{ ...outside, searchQuery: 'https://example.com/audio' }] }, songs)).toThrow();
    expect(() => validateMusicRecommendations({ ...plan(), command: 'GO' }, songs)).toThrow();
  });
  it('requires clarification choices without simultaneous suggestions', () => {
    expect(validateMusicRecommendations({ summary: 'Choose.', clarification: 'Warm or tense?', choices: ['Warm', 'Tense'], suggestions: [] }, songs).choices).toHaveLength(2);
    expect(() => validateMusicRecommendations({ ...plan(), clarification: 'Warm?', choices: [] }, songs)).toThrow();
    expect(() => validateMusicRecommendations({ ...plan(), clarification: 'Warm?', choices: ['Warm'] }, songs)).toThrow();
    expect(() => validateMusicRecommendations({ ...plan(), choices: ['Warm'] }, songs)).toThrow();
  });
});
