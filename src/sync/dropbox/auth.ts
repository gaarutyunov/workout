import { challengeFromVerifier, randomState, randomVerifier } from './pkce';

// Dropbox OAuth (Authorization Code + PKCE, token_access_type=offline, no secret).
// Tokens live in browser storage (§4, §11). The refresh token is long-lived and
// sensitive — anyone with this browser's storage can reach the app folder.

const APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY ?? '';

const STORAGE = {
  verifier: 'fitness.dropbox.pkceVerifier',
  state: 'fitness.dropbox.oauthState',
  refresh: 'fitness.dropbox.refreshToken',
};

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropbox.com/oauth2/token';

export function isConfigured(): boolean {
  return APP_KEY.length > 0;
}

export function hasRefreshToken(): boolean {
  return !!localStorage.getItem(STORAGE.refresh);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE.refresh);
}

export function disconnect(): void {
  localStorage.removeItem(STORAGE.refresh);
  sessionAccessToken = null;
  accessTokenExpiry = 0;
}

/** Redirect URI = this app's origin + path, no query/hash (HashRouter-safe). */
export function redirectUri(): string {
  return window.location.origin + window.location.pathname;
}

/** Step 1: build the authorize URL and redirect the browser to Dropbox. */
export async function beginAuth(): Promise<void> {
  if (!isConfigured()) throw new Error('Dropbox app key not configured (VITE_DROPBOX_APP_KEY).');
  const verifier = randomVerifier();
  const challenge = await challengeFromVerifier(verifier);
  const state = randomState();
  localStorage.setItem(STORAGE.verifier, verifier);
  localStorage.setItem(STORAGE.state, state);

  const params = new URLSearchParams({
    client_id: APP_KEY,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: redirectUri(),
    state,
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

/**
 * Step 2: on redirect back, exchange the `code` for tokens. Returns true if a
 * code was present and exchanged. Call once on app load.
 */
export async function completeAuthFromRedirect(): Promise<boolean> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code) return false;

  const expectedState = localStorage.getItem(STORAGE.state);
  const verifier = localStorage.getItem(STORAGE.verifier);
  // Clean the query string regardless of outcome so a refresh can't replay it.
  cleanUrl();
  if (!verifier || !expectedState || returnedState !== expectedState) {
    throw new Error('OAuth state mismatch — aborting token exchange.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: APP_KEY,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Dropbox token exchange failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (json.refresh_token) localStorage.setItem(STORAGE.refresh, json.refresh_token);
  setAccessToken(json.access_token, json.expires_in ?? 14400);
  localStorage.removeItem(STORAGE.verifier);
  localStorage.removeItem(STORAGE.state);
  return true;
}

function cleanUrl(): void {
  const clean = window.location.origin + window.location.pathname + window.location.hash;
  window.history.replaceState({}, document.title, clean);
}

// --- short-lived access token, minted from the refresh token on demand ---

let sessionAccessToken: string | null = null;
let accessTokenExpiry = 0;
let refreshInFlight: Promise<string> | null = null;

function setAccessToken(token: string, expiresInSec: number): void {
  sessionAccessToken = token;
  // refresh a minute early to avoid edge-of-expiry 401s
  accessTokenExpiry = Date.now() + (expiresInSec - 60) * 1000;
}

export async function getAccessToken(): Promise<string> {
  if (sessionAccessToken && Date.now() < accessTokenExpiry) return sessionAccessToken;
  if (refreshInFlight) return refreshInFlight;

  const refresh = getRefreshToken();
  if (!refresh) throw new Error('Not connected to Dropbox.');

  refreshInFlight = (async () => {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: APP_KEY,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 401) disconnect();
      throw new Error(`Dropbox refresh failed: ${res.status}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    setAccessToken(json.access_token, json.expires_in ?? 14400);
    return json.access_token;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
