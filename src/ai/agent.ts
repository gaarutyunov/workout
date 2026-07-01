import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, type CoreMessage } from 'ai';
import type { AppDatabase } from '../db/database';
import { createTools, type ToolContext } from './tools';
import { SYSTEM_PROMPT } from './systemPrompt';
import { getApiKey, getModel } from './openrouter';

// §8.1: client-side agent loop. Vercel AI SDK + OpenRouter (user's key). maxSteps > 1
// lets the model chain tool calls (parse notes → write several docs → confirm) in a
// single turn. Tool calls hit local RxDB, so logging works fully offline; only the
// model round-trip needs connectivity.

export interface RunAgentOptions {
  db: AppDatabase;
  activeDate: string;
  isBackfill: boolean;
  messages: CoreMessage[];
  model?: string;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (name: string) => void;
}

export interface AgentTurnResult {
  text: string;
  toolsUsed: string[];
}

export async function runAgentTurn(opts: RunAgentOptions): Promise<AgentTurnResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No OpenRouter key — connect your account in Settings.');

  const openrouter = createOpenRouter({
    apiKey,
    compatibility: 'strict',
    // OpenRouter recommends these for browser apps (ranking/attribution). They also
    // make the request unambiguously first-party.
    headers: {
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Fitness Tracker',
    },
  });
  const toolCtx: ToolContext = {
    db: opts.db,
    activeDate: opts.activeDate,
    isBackfill: opts.isBackfill,
  };
  const tools = createTools(toolCtx);
  const toolsUsed: string[] = [];

  // AI SDK v4's streamText does NOT throw on errors that happen mid-stream — it
  // routes them to onError. Without this, a failed call (bad key, no credits,
  // model/tool error, CORS) would silently yield an empty reply. Capture it and
  // rethrow after the stream so the UI can show the real cause.
  let streamError: unknown = null;

  const result = streamText({
    model: openrouter(opts.model ?? getModel()),
    system: SYSTEM_PROMPT,
    messages: opts.messages,
    tools,
    maxSteps: 8,
    onError: ({ error }) => {
      streamError = error;
    },
    onStepFinish: ({ toolCalls }) => {
      for (const call of toolCalls ?? []) {
        toolsUsed.push(call.toolName);
        opts.onToolCall?.(call.toolName);
      }
    },
  });

  let text = '';
  try {
    for await (const delta of result.textStream) {
      text += delta;
      opts.onTextDelta?.(delta);
    }
  } catch (e) {
    streamError = streamError ?? e;
  }

  if (streamError) throw new Error(describeError(streamError));
  return { text, toolsUsed };
}

/** Flatten an AI SDK / OpenRouter error into a readable one-line message. */
function describeError(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const e = err as {
    message?: string;
    statusCode?: number;
    responseBody?: string;
    cause?: { message?: string };
    name?: string;
  };
  const parts: string[] = [];
  if (e.statusCode) parts.push(`HTTP ${e.statusCode}`);
  const msg = e.message ?? e.name ?? 'Unknown error';
  parts.push(msg);
  if (e.responseBody && !msg.includes(e.responseBody)) {
    parts.push(e.responseBody.slice(0, 400));
  } else if (e.cause?.message && !msg.includes(e.cause.message)) {
    parts.push(e.cause.message);
  }
  return parts.join(' — ');
}
