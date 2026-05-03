/**
 * LLM fallback agent for Ralph.
 *
 * The only path that calls a paid LLM. Used when the router can't pin the
 * user prompt to a stock/MF/portfolio/compare intent — small talk, vague
 * questions, follow-up clarifications. Fails open: if no API key is
 * configured, the orchestrator catches the throw and emits a polite stub.
 */

import { getPreferredChatModel, openAIChat } from '@/lib/llm/openai';
import type { AgentFinding, ChatTurn } from '../types';

function compactTurns(turns: ChatTurn[], maxChars = 4000): string {
  // Token-conscious: keep last turns only.
  const parts: string[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    parts.unshift(`${t.role.toUpperCase()}: ${t.content}`);
    if (parts.join('\n').length > maxChars) {
      parts.shift();
      break;
    }
  }
  return parts.join('\n');
}

/**
 * Generate a JSON-shaped answer from the LLM. Returns the finding and the
 * raw token usage so the orchestrator can include it in `meta.tokenUsage`.
 */
export async function runGeneralAnswerAgent(turns: ChatTurn[]): Promise<{ finding: AgentFinding; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
  const model = getPreferredChatModel();
  const transcript = compactTurns(turns);

  const system = [
    'You are Artha’s assistant.',
    'Write in a clean, structured way.',
    'Do not reveal hidden chain-of-thought. Provide a short "Why" that explains the reasoning at a high level.',
    'Be concise and practical. Prefer bullets. Ask at most one follow-up question if required.',
  ].join(' ');

  const prompt = [
    'Return ONLY valid JSON with keys:',
    '{ "answer": string, "why": string[], "assumptions": string[], "nextSteps": string[] }',
    'Keep "why" to 3-6 bullets. Keep tokens low.',
    '',
    transcript,
  ].join('\n');

  const res = await openAIChat({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    maxTokens: 650,
  });

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    parsed = { answer: res.text, why: [], assumptions: [], nextSteps: [] };
  }

  return {
    finding: {
      agent: 'General',
      summary: 'Drafted response using LLM.',
      evidence: Array.isArray(parsed.why) ? parsed.why : [],
      data: parsed,
    },
    usage: res.usage,
  };
}
