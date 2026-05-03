/**
 * Type contracts for the Ralph multi-agent chat.
 *
 * The flow is: user prompt → router (picks an intent) → specialist agent(s)
 * → orchestrator (synthesizes a single answer + supporting agent cards) → UI.
 *
 * Every public export here is consumed by `app/api/chat/route.ts` and the
 * `app/chat/page.tsx` UI. Changing a shape is a breaking change — bump the
 * UI's response parser at the same time.
 */

/** Speaker side in a chat turn. */
export type ChatRole = 'user' | 'assistant';

/** A single round of conversation. The LLM general agent and the persistence
 *  layer both consume arrays of these. */
export interface ChatTurn {
  role: ChatRole;
  content: string;
}

/** The five intents the router can dispatch. Adding one means: adding a case
 *  in `router.ts`, an agent under `agents/`, and a branch in `orchestrator.ts`. */
export type RalphIntent = 'stock' | 'mf' | 'portfolio' | 'compare' | 'general';

/** Whether a comparison is between two stocks or two mutual funds. */
export type CompareKind = 'stock' | 'mf';

/** What `ralphRespond` takes. `userId` is only required for the portfolio
 *  intent — every other path works without it. */
export interface RalphRequest {
  turns: ChatTurn[];
  userId?: string | null;
}

/**
 * One agent's output. Findings are how every specialist agent (Stock, MF,
 * Portfolio, Compare, the 6 sub-stock agents, and the LLM General agent)
 * reports back. The chat UI renders one card per finding.
 */
export interface AgentFinding {
  /** Display name shown on the card header (e.g. "Mutual Fund", "Compare",
   *  "Fundamental"). */
  agent: string;
  /** One-line headline. Shown immediately under the agent name. */
  summary: string;
  /** 0–10 if the agent emits a score; undefined for narrative-only findings. */
  score?: number;
  /** Optional verdict label (e.g. "Strong Buy", "Hold"). */
  verdict?: string;
  /** Bullet points the user reads to "show your work". */
  evidence?: string[];
  /** Risk flags / red bullets. */
  warnings?: string[];
  /** Free-form structured data the UI can drill into. Not displayed by default. */
  data?: Record<string, unknown>;
}

/**
 * What `ralphRespond` returns to the API route. The chat UI parses this
 * shape directly — `answer` becomes the bubble text, `why` becomes the
 * collapsible explanation, `nextSteps` becomes the suggestion chips, and
 * `agents` becomes the card grid.
 */
export interface RalphResponse {
  /** The headline answer. Markdown allowed; the UI renders it as plain text
   *  with `whitespace-pre-wrap`. */
  answer: string;
  /** "Why" bullets — collapsible. Keep ≤ 6 lines. */
  why: string[];
  /** Stated assumptions the agent made. Optional. */
  assumptions?: string[];
  /** Suggested follow-up prompts the user can click as chips. */
  nextSteps?: string[];
  /** Specialist agent outputs. Rendered as cards under the answer. */
  agents: AgentFinding[];
  meta: {
    intent: RalphIntent;
    ticker?: string;
    schemeCode?: string;
    compareKind?: CompareKind;
    compareLeft?: string;
    compareRight?: string;
    latencyMs: number;
    tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    /** Populated by `applyCompliance` (lib/ralph/compliance.ts). Present on
     *  every response that completes successfully; absent only on
     *  pre-compliance drafts (which should never reach the wire). */
    compliance?: {
      passed: boolean;
      edits: string[];
      rulesFired: string[];
      disclaimerAppended: boolean;
    };
    /** Populated by the data layer (lib/data/source.ts). Lets the UI badge
     *  responses with a "data 7m old" pill when staleness matters. */
    dataFreshness?: {
      oldestSourceAt?: string;     // ISO timestamp
      anyStale?: boolean;
      sources?: Array<{ name: string; fetchedAt: string; stale: boolean }>;
    };
  };
}

