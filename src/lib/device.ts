// A stable per-device identifier, persisted in localStorage. Used to stamp every
// write (`deviceId`) so the conflict handler can break updatedAt ties (§5/§6) and
// so a device can recognise its own writes during replication.

const KEY = 'fitness.deviceId';

function randomId(): string {
  // Prefer crypto.randomUUID; fall back to a random hex string.
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

let cached: string | null = null;

export function getDeviceId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = `dev-${randomId()}`;
    localStorage.setItem(KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // localStorage unavailable (private mode / SSR) → ephemeral id
    cached = cached ?? `dev-${randomId()}`;
    return cached;
  }
}
