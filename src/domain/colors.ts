export type SongColor = 'red' | 'yellow' | 'green' | 'blue' | 'purple' | 'orange' | 'none';

/** Stable song metadata is independent of the current theme's presentation colors. */
export function canonicalColor(token?: string): SongColor {
  const value = token?.toLowerCase();
  if (value === 'red' || value === 'danger') return 'red';
  if (value === 'yellow' || value === 'warning') return 'yellow';
  if (value === 'green' || value === 'success') return 'green';
  if (value === 'blue' || value === 'accent') return 'blue';
  if (value === 'purple' || value === 'orange') return value;
  return 'none';
}
