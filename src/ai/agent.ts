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

  const openrouter = createOpenRouter({ apiKey });
  const toolCtx: ToolContext = {
    db: opts.db,
    activeDate: opts.activeDate,
    isBackfill: opts.isBackfill,
  };
  const tools = createTools(toolCtx);
  const toolsUsed: string[] = [];

  const result = streamText({
    model: openrouter(opts.model ?? getModel()),
    system: SYSTEM_PROMPT,
    messages: opts.messages,
    tools,
    maxSteps: 8,
    onStepFinish: ({ toolCalls }) => {
      for (const call of toolCalls ?? []) {
        toolsUsed.push(call.toolName);
        opts.onToolCall?.(call.toolName);
      }
    },
  });

  let text = '';
  for await (const delta of result.textStream) {
    text += delta;
    opts.onTextDelta?.(delta);
  }
  return { text, toolsUsed };
}
