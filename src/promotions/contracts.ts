export type PromoSurface = 'library' | 'builder' | 'rehearsal' | 'preflight' | 'controller' | 'settings';
export interface PromoPlacementV1 {
  readonly id: string; readonly surface: PromoSurface;
  readonly title: string; readonly body: string; readonly actionLabel: string;
  readonly actionUrl: string; readonly startsAtEpochMs?: number; readonly endsAtEpochMs?: number;
}
export interface PromoManifestV1 {
  readonly schemaVersion: 1; readonly revision: number; readonly placements: readonly PromoPlacementV1[];
}
export interface EntitlementSnapshot { readonly revision: number; readonly features: Readonly<Record<string, boolean>>; }
export interface EntitlementProvider {
  getSnapshot(): Promise<EntitlementSnapshot>;
  subscribe(listener: (snapshot: EntitlementSnapshot) => void): () => void;
}
const PROMO_SURFACES = new Set<PromoSurface>(['library', 'builder', 'rehearsal', 'preflight', 'controller', 'settings']);
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
const validEpoch = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isValidPromotionPlacement(
  value: unknown,
  allowedHosts?: readonly string[],
): value is PromoPlacementV1 {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PromoPlacementV1>;
  if (!boundedText(item.id, 128) || !PROMO_SURFACES.has(item.surface as PromoSurface) ||
      !boundedText(item.title, 120) || !boundedText(item.body, 400) ||
      !boundedText(item.actionLabel, 80) || !boundedText(item.actionUrl, 2_048)) return false;
  if (item.startsAtEpochMs !== undefined && !validEpoch(item.startsAtEpochMs)) return false;
  if (item.endsAtEpochMs !== undefined && !validEpoch(item.endsAtEpochMs)) return false;
  if (item.startsAtEpochMs !== undefined && item.endsAtEpochMs !== undefined && item.endsAtEpochMs <= item.startsAtEpochMs) return false;
  try {
    const url = new URL(item.actionUrl);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    if (allowedHosts && !allowedHosts.map((host) => host.toLowerCase()).includes(url.hostname.toLowerCase())) return false;
  } catch {
    return false;
  }
  return true;
}

export function activePromotions(
  manifest: PromoManifestV1,
  nowEpochMs: number,
  allowedHosts?: readonly string[],
): readonly PromoPlacementV1[] {
  if (manifest.schemaVersion !== 1 || !Number.isSafeInteger(manifest.revision) || manifest.revision < 0 ||
      !Array.isArray(manifest.placements) || !validEpoch(nowEpochMs)) return [];
  const seen = new Set<string>();
  return manifest.placements.filter((item) => {
    if (!isValidPromotionPlacement(item, allowedHosts) || seen.has(item.id)) return false;
    seen.add(item.id);
    return (item.startsAtEpochMs === undefined || item.startsAtEpochMs <= nowEpochMs) &&
      (item.endsAtEpochMs === undefined || item.endsAtEpochMs > nowEpochMs);
  });
}

export type LivePromotionState = 'editing' | 'rehearsal' | 'preflight' | 'armed' | 'running' | 'recovery';
export function promotionsAllowed(state: LivePromotionState, removed: boolean): boolean {
  return !removed && state !== 'armed' && state !== 'running' && state !== 'recovery';
}
