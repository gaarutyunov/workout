import { challengeFromVerifier, randomVerifier } from '../sync/dropbox/pkce';
import { clearPendingOAuth, getPendingOAuth, setPendingOAuth } from '../lib/oauthPending';

// §8.1: reach the model through the user's own OpenRouter account. Either OAuth PKCE
// (no secret) or a pasted API key. The key lives in browser storage; the real cost
// guardrail is a per-key spend limit set in OpenRouter.

const STORAGE = {
  key: 'fitness.openrouter.key',
  verifier: 'fitness.openrouter.pkceVerifier',
  model: 'fitness.openrouter.model',
};

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';
export const ANALYSIS_MODEL = 'anthropic/claude-3.5-sonnet';

const AUTH_URL = 'https://openrouter.ai/auth';
const KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys';

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE.key);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE.key, key.trim());
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE.key);
}

export function getModel(): string {
  return localStorage.getItem(STORAGE.model) ?? DEFAULT_MODEL;
}

export function setModel(model: string): void {
  localStorage.setItem(STORAGE.model, model);
}

function callbackUrl(): string {
  return window.location.origin + window.location.pathname;
}

/** Step 1: redirect to OpenRouter for PKCE authorization. */
export async function beginAuth(): Promise<void> {
  const verifier = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  localStorage.setItem(STORAGE.verifier, verifier);
  // Mark this provider as the pending OAuth so the shared `?code=` callback is
  // routed here and not to the Dropbox handler.
  setPendingOAuth('openrouter');
  const params = new URLSearchParams({
    callback_url: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

/** Step 2: exchange the returned `code` for a user API key. Returns true if handled. */
export async function completeAuthFromRedirect(): Promise<boolean> {
  // Only act on our own callback — Dropbox uses the same `?code=` redirect.
  if (getPendingOAuth() !== 'openrouter') return false;

  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;
  const verifier = localStorage.getItem(STORAGE.verifier);
  // Clean the query so a refresh can't replay the code, and clear the pending flag.
  window.history.replaceState(
    {},
    document.title,
    window.location.origin + window.location.pathname + window.location.hash,
  );
  clearPendingOAuth();
  if (!verifier) return false;

  const res = await fetch(KEYS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenRouter key exchange failed: ${res.status} ${body}`.trim());
  }
  const json = (await res.json()) as { key: string };
  setApiKey(json.key);
  localStorage.removeItem(STORAGE.verifier);
  return true;
}
