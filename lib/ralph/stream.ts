/**
 * Server-Sent Event types and serializer for the streaming chat route.
 *
 * Used by:
 *   - `app/api/chat/stream/route.ts` (server) — emits these events
 *   - `app/chat/page.tsx` (client) — consumes them and progressively renders
 *
 * Wire format
 * -----------
 * Standard SSE: `data: <json>\n\n`. Each line is one event from this union.
 * The client should parse `JSON.parse(line.slice(6))` per line.
 *
 * Ordering contract
 * -----------------
 * 1. Exactly one `route` event first.
 * 2. Zero-or-more `finding` events as specialists complete.
 * 3. Zero-or-more `token` events (only for the `general` intent).
 * 4. Exactly one `done` event with the final compliance-checked payload.
 * 5. OR exactly one `error` event if the request fails before `done`.
 *
 * The `done` event is the authoritative answer — clients should display
 * `payload.answer` from `done`, not the concatenation of `token` events.
 * Token events are for UX shimmer only (see compliance interaction sign).
 */

import type { AgentFinding, RalphIntent, RalphResponse } from './types';

export interface RouteEvent {
  type: 'route';
  intent: RalphIntent;
  ticker?: string;
  schemeCode?: string;
  compareKind?: 'stock' | 'mf';
  /** Server timestamp when routing decision was made. Used by the client
   *  to compute "time-to-first-event" without coordinating clocks. */
  at: number;
}

export interface FindingEvent {
  type: 'finding';
  finding: AgentFinding;
  /** Index in the eventual `agents[]` array. Lets the client pre-allocate
   *  card slots when `route` arrives, then fill them in order. */
  index: number;
  at: number;
}

export interface TokenEvent {
  type: 'token';
  /** Raw delta from the LLM. NOT sanitised — display only as a shimmer.
   *  The authoritative text is in the eventual `done` payload. */
  delta: string;
  at: number;
}

export interface DoneEvent {
  type: 'done';
  /** The full RalphResponse, post-compliance. This is the source of truth
   *  for what the user sees and what gets persisted. */
  payload: RalphResponse;
  at: number;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  /** Whether the client should retry. Server sets `false` for permanent
   *  failures (no broker token, malformed input). */
  retryable: boolean;
  at: number;
}

export type StreamEvent = RouteEvent | FindingEvent | TokenEvent | DoneEvent | ErrorEvent;

/** Serialize one event to an SSE wire chunk. */
export function serializeSSE(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Convenience: build a TextEncoder-encoded chunk ready for
 *  `controller.enqueue(...)` inside a `ReadableStream`. */
export function encodeSSE(encoder: TextEncoder, event: StreamEvent): Uint8Array {
  return encoder.encode(serializeSSE(event));
}

/** Recommended response headers for an SSE route. The `X-Accel-Buffering: no`
 *  header is critical on Vercel — without it the platform buffers the whole
 *  response and defeats the streaming. */
export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};
