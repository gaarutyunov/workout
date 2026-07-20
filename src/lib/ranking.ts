import type { MenuItem } from '../db/types';

// §6.12: rank menu suggestions by frequency (timesLogged) blended with recency
// (lastEaten). Optionally filter by slot. Higher score = surfaced first.

function recencyScore(lastEaten: string | null | undefined, today: string): number {
  if (!lastEaten) return 0;
  const days = daysBetween(lastEaten, today);
  if (days <= 0) return 1;
  // smooth decay: ~0.5 at two weeks, approaching 0 as it ages out
  return 1 / (1 + days / 14);
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, (am ?? 1) - 1, ad ?? 1);
  const db = Date.UTC(by, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((db - da) / 86_400_000);
}

export function scoreMenuItem(item: MenuItem, today: string): number {
  const freq = Math.log2(1 + (item.timesLogged ?? 0));
  const recency = recencyScore(item.lastEaten, today);
  return freq + recency * 2;
}

export function rankMenuItems(
  items: MenuItem[],
  today: string,
  opts: { slot?: string | null; limit?: number } = {},
): MenuItem[] {
  const filtered = opts.slot
    ? items.filter((i) => !i.defaultSlot || i.defaultSlot === opts.slot)
    : items;
  const sorted = [...filtered].sort((a, b) => scoreMenuItem(b, today) - scoreMenuItem(a, today));
  return opts.limit ? sorted.slice(0, opts.limit) : sorted;
}
