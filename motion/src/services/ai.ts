/**
 * ai.ts — Unified AI router
 *
 * Every service in this codebase calls THIS file, never Ollama or Gemini directly.
 *
 * Routing rules (controlled by GEMINI_API_KEY env var):
 *   "fast" tier  → llama3.2:3b via Ollama  (local, private, no cost)
 *   "smart" tier → gemini-3.5-flash-lite via Gemini API (cloud, free tier)
 *
 * If GEMINI_API_KEY is not set, all calls fall back to Ollama regardless of tier.
 * If OLLAMA_URL is not reachable, smart-tier calls NEVER fall back to Ollama
 * (to avoid silent quality degradation for resume / job intelligence tasks).
 */

import { generateJson as ollamaGenerateJson, type JsonOptions } from "./ollamaJson.js";
import { streamChat as ollamaStreamChat, generateTitle as ollamaGenerateTitle } from "./llm.js";
import type { ChatMessage } from "./llm.js";
import {
  geminiGenerateJson,
  geminiStreamChat,
  geminiGenerateTitle,
} from "./gemini.js";

export type Tier = "fast" | "smart";

/** Is the Gemini API key available? */
function hasGemini(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// ---------------------------------------------------------------------------
// generateJson — structured JSON output
// ---------------------------------------------------------------------------
export async function generateJson<T>(
  system: string,
  user: string,
  schema: object,
  opts: JsonOptions & { tier?: Tier } = {}
): Promise<T> {
  const { tier = "smart", ...ollamaOpts } = opts;

  if (tier === "smart" && hasGemini()) {
    return geminiGenerateJson<T>(system, user, schema);
  }
  // fast tier OR no Gemini key → Ollama
  return ollamaGenerateJson<T>(system, user, schema, ollamaOpts);
}

// ---------------------------------------------------------------------------
// streamChat — streaming chat with optional RAG context
// ---------------------------------------------------------------------------
export async function* streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  context?: string,
  tier: Tier = "fast"   // chat defaults to local (fast, private)
): AsyncGenerator<string> {
  if (tier === "smart" && hasGemini()) {
    yield* geminiStreamChat(messages, signal, context);
  } else {
    yield* ollamaStreamChat(messages, signal, context);
  }
}

// ---------------------------------------------------------------------------
// generateTitle — short 3–6 word chat title
// ---------------------------------------------------------------------------
export async function generateTitle(
  userText: string,
  assistantText: string
): Promise<string | null> {
  // Title generation is lightweight — use Gemini only if available,
  // otherwise fall back to local (quality is acceptable for titles)
  if (hasGemini()) {
    return geminiGenerateTitle(userText, assistantText);
  }
  return ollamaGenerateTitle(userText, assistantText);
}

export type { ChatMessage };
