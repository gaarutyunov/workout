// Dropbox and OpenRouter both use OAuth Authorization-Code + PKCE and both come back
// to the SAME redirect URI with a `?code=` query param. Without disambiguation, the
// first handler to run consumes/strips the code and the other never sees it. Before
// redirecting, a flow records which provider is pending; on return, only that
// provider's completer acts.

export type OAuthProvider = 'dropbox' | 'openrouter';

const KEY = 'fitness.oauth.pending';

export function setPendingOAuth(provider: OAuthProvider): void {
  try {
    sessionStorage.setItem(KEY, provider);
  } catch {
    localStorage.setItem(KEY, provider);
  }
}

export function getPendingOAuth(): OAuthProvider | null {
  try {
    return (sessionStorage.getItem(KEY) as OAuthProvider | null) ?? (localStorage.getItem(KEY) as OAuthProvider | null);
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
