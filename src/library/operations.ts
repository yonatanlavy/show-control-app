import type { AudioCue, Cue, Show, ShowSet, VoiceRule } from '../domain';
import { SONG_DEFAULTS } from '../music/categories';
import { checkedName } from './names';
export { checkedName } from './names';

export type IdFactory = () => string;
export const copyDocument = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function revised(show: Show, id: IdFactory, now: () => string): Show {
  return { ...copyDocument(show), schemaVersion: 2, revisionId: id(), updatedAt: now() };
}
export function newShow(name: string, id: IdFactory, now: () => string): Show {
  return { id: id(), revisionId: id(), name: checkedName(name), updatedAt: now(), schemaVersion: 2,
    sets: [{ id: id(), name: checkedName(name), cueOrder: [], hitCueIds: [], transportMode: 'oms' }],
    cues: {}, media: {}, visualAssets: {}, voiceRules: [], panicFadeMs: 2000 };
}
export function newAudioCue(assetId: string, name: string, id: IdFactory): AudioCue {
  return { id: id(), type: 'audio', name: checkedName(name), tags: [], mediaAssetId: assetId,
    trimInMs: 0, ...SONG_DEFAULTS };
}
export function editSet(show: Show, setId: string, edit: (set: ShowSet) => ShowSet): Show {
  if (!show.sets.some((set) => set.id === setId)) throw new Error('Set does not exist.');
  return { ...show, sets: show.sets.map((set) => set.id === setId ? edit(copyDocument(set)) : set) };
}
export function exactOrder(current: readonly string[], requested: readonly string[]): readonly string[] {
  if (current.length !== requested.length || new Set(requested).size !== requested.length ||
      requested.some((value) => !current.includes(value))) throw new Error('Order must contain every existing item exactly once.');
  return [...requested];
}
function remapCue(cue: Cue, ids: ReadonlyMap<string, string>): Cue {
  const value = { ...copyDocument(cue), id: ids.get(cue.id) ?? cue.id };
  if (value.type === 'group') return { ...value, children: value.children.map((child) => ({ ...child, cueId: ids.get(child.cueId) ?? child.cueId })) };
  if ((value.type === 'fade' || value.type === 'stop') && value.selector.kind === 'cueIds')
    return { ...value, selector: { ...value.selector, cueIds: value.selector.cueIds.map((cueId) => ids.get(cueId) ?? cueId) } };
  return value;
}
function remapRule(rule: VoiceRule, ids: ReadonlyMap<string, string>, id: IdFactory): VoiceRule {
  return { ...copyDocument(rule), id: id(), ...(rule.cueId ? { cueId: ids.get(rule.cueId) ?? rule.cueId } : {}),
    action: rule.action.type === 'PLAY' ? { ...rule.action, cueId: ids.get(rule.action.cueId) ?? rule.action.cueId } : rule.action };
}
export function duplicateShowDocument(show: Show, name: string, id: IdFactory, now: () => string): Show {
  // Cue identities are scoped to a show. Retaining them preserves portable controller
  // targets; deep copies still give each show independent definitions and tuning.
  return { ...revised(show, id, now), id: id(), name: checkedName(name),
    cues: copyDocument(show.cues),
    sets: show.sets.map((set) => ({ ...copyDocument(set), id: id() })),
    voiceRules: copyDocument(show.voiceRules ?? []) };
}
export function duplicateSetDocument(show: Show, setId: string, name: string, id: IdFactory): Show {
  const set = show.sets.find((value) => value.id === setId);
  if (!set) throw new Error('Set does not exist.');
  const ids = new Map<string, string>();
  const visit = (cueId: string) => {
    if (ids.has(cueId)) return;
    const cue = show.cues[cueId];
    if (!cue) throw new Error('Cue does not exist.');
    ids.set(cueId, id());
    if (cue.type === 'group') cue.children.forEach((child) => visit(child.cueId));
  };
  [...set.cueOrder, ...set.hitCueIds].forEach(visit);
  const cues = { ...show.cues };
  ids.forEach((_newId, oldId) => { const cue = remapCue(show.cues[oldId]!, ids); cues[cue.id] = cue; });
  return { ...show, cues, sets: [...show.sets, { ...copyDocument(set), id: id(), name: checkedName(name),
    cueOrder: set.cueOrder.map((cueId) => ids.get(cueId)!), hitCueIds: set.hitCueIds.map((cueId) => ids.get(cueId)!) }],
    voiceRules: [...(show.voiceRules ?? []), ...(show.voiceRules ?? []).filter((rule) => rule.cueId && ids.has(rule.cueId)).map((rule) => remapRule(rule, ids, id))] };
}
export function removeCueDocument(show: Show, cueId: string): Show {
  if (!show.cues[cueId]) throw new Error('Cue does not exist.');
  const cues: Record<string, Cue> = {};
  for (const [key, cue] of Object.entries(show.cues)) {
    if (key === cueId) continue;
    if (cue.type === 'group') cues[key] = { ...cue, children: cue.children.filter((child) => child.cueId !== cueId) };
    else if ((cue.type === 'fade' || cue.type === 'stop') && cue.selector.kind === 'cueIds')
      cues[key] = { ...cue, selector: { ...cue.selector, cueIds: cue.selector.cueIds.filter((value) => value !== cueId) } };
    else cues[key] = cue;
  }
  return { ...show, cues, sets: show.sets.map((set) => ({ ...set, cueOrder: set.cueOrder.filter((value) => value !== cueId), hitCueIds: set.hitCueIds.filter((value) => value !== cueId) })),
    voiceRules: (show.voiceRules ?? []).filter((rule) => rule.cueId !== cueId && !(rule.action.type === 'PLAY' && rule.action.cueId === cueId)) };
}
/** Schema-one saves preserve their original cue-stack grammar. Never restore audible state. */
export function upgradeShowDocument(show: Show): Show {
  if (show.schemaVersion !== undefined && show.schemaVersion > 2) throw new Error('Show schema is newer than this app.');
  return { ...copyDocument(show), schemaVersion: 2, sets: show.sets.map((set) => ({ ...copyDocument(set), transportMode: set.transportMode ?? 'legacyCueStack' })),
    cues: Object.fromEntries(Object.entries(show.cues).map(([key, cue]) => [key, cue.type === 'audio' ?
      { ...cue, playbackRate: cue.playbackRate ?? 1, autoPlay: cue.autoPlay ?? false, crossfadeEnabled: cue.crossfadeEnabled ?? false, crossfadeMs: cue.crossfadeMs ?? 2000 } : cue])),
    visualAssets: copyDocument(show.visualAssets ?? {}), voiceRules: copyDocument(show.voiceRules ?? []) };
}
