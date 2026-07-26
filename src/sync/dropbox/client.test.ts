import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./auth', () => ({ getAccessToken: async () => 'test-token' }));

import { filesUpload, listFolder } from './client';

// Regression tests for #4: both endpoints answered 400. The RPC host was the
// website (api.dropbox.com) rather than the API (api.dropboxapi.com), and the
// upload's Dropbox-API-Arg header carried raw non-ASCII, which Dropbox rejects.

const calls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ entries: [], cursor: 'c', has_more: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('Dropbox client', () => {
  it('calls RPC endpoints on the API host, not the website host', async () => {
    await listFolder('');
    expect(calls[0].url).toBe('https://api.dropboxapi.com/2/files/list_folder');
  });

  it('escapes non-ASCII in the Dropbox-API-Arg header', async () => {
    await filesUpload('/Übung – 1.json', { a: 1 });
    const arg = new Headers(calls[0].init.headers).get('Dropbox-API-Arg') ?? '';
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7f]/.test(arg)).toBe(false);
    expect(JSON.parse(arg).path).toBe('/Übung – 1.json');
  });

  it('sends the document as an octet-stream body', async () => {
    await filesUpload('/a.json', { a: 1 });
    expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('application/octet-stream');
    expect(calls[0].init.body).toBe('{"a":1}');
  });

  it('rejects a path that is not absolute before calling the API', async () => {
    await expect(filesUpload('a.json', {})).rejects.toThrow(/must start with/);
    expect(calls).toHaveLength(0);
  });
});
