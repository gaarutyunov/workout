import { getAccessToken } from './auth';

// Thin Dropbox API wrapper (§5/§11). Handles auth headers, 429 backoff with
// Retry-After, and 401 → token refresh + single retry. One JSON file per document.

const RPC = 'https://api.dropbox.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_lower: string;
  path_display?: string;
  id?: string;
  server_modified?: string;
  content_hash?: string;
}

export interface ListFolderResult {
  entries: DropboxEntry[];
  cursor: string;
  has_more: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function authedFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });

  if (res.status === 429 && attempt < 5) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
    const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 1000, 16000);
    await sleep(backoff);
    return authedFetch(url, init, attempt + 1);
  }
  if (res.status >= 500 && attempt < 4) {
    await sleep(Math.min(2 ** attempt * 1000, 16000));
    return authedFetch(url, init, attempt + 1);
  }
  return res;
}

async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await authedFetch(`${RPC}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? 'null' : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Dropbox ${endpoint} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Upload one document as JSON, overwriting any existing file at the path. */
export async function filesUpload(path: string, contents: unknown): Promise<void> {
  const res = await authedFetch(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode: 'overwrite',
        mute: true,
        strict_conflict: false,
      }),
    },
    body: JSON.stringify(contents),
  });
  if (!res.ok) throw new Error(`Dropbox upload ${path} failed: ${res.status} ${await res.text()}`);
}

/** Download + parse a JSON document. Returns null if the file is gone (409 not_found). */
export async function filesDownloadJson<T>(path: string): Promise<T | null> {
  const res = await authedFetch(`${CONTENT}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': JSON.stringify({ path }) },
  });
  if (res.status === 409) return null;
  if (!res.ok) throw new Error(`Dropbox download ${path} failed: ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function filesDelete(path: string): Promise<void> {
  const res = await authedFetch(`${RPC}/files/delete_v2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  // 409 = already gone; that's fine for a delete.
  if (!res.ok && res.status !== 409) {
    throw new Error(`Dropbox delete ${path} failed: ${res.status}`);
  }
}

export function listFolder(path: string, recursive = true): Promise<ListFolderResult> {
  return rpc<ListFolderResult>('/files/list_folder', {
    path,
    recursive,
    include_deleted: true,
  });
}

export function listFolderContinue(cursor: string): Promise<ListFolderResult> {
  return rpc<ListFolderResult>('/files/list_folder/continue', { cursor });
}

export async function getLatestCursor(path: string, recursive = true): Promise<string> {
  const { cursor } = await rpc<{ cursor: string }>('/files/list_folder/get_latest_cursor', {
    path,
    recursive,
    include_deleted: true,
  });
  return cursor;
}
