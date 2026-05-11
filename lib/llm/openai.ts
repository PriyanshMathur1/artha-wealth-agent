export type OpenAIChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export interface OpenAIChatOptions {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  tools?: any[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface OpenAIChatResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>;
}

type Provider =
  | { kind: 'groq' | 'openai'; apiKey: string; baseUrl: string }
  | { kind: 'anthropic'; apiKey: string; baseUrl: string };

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** Resolves the API key and base URL.
 *  Priority: GROQ_API_KEY → OPENAI_API_KEY → ANTHROPIC_API_KEY. */
function resolveProvider(): Provider {
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    return {
      kind: 'groq',
      apiKey: groqKey,
      baseUrl: (process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    };
  }
  const openAIKey = process.env.OPENAI_API_KEY;
  if (openAIKey) {
    return {
      kind: 'openai',
      apiKey: openAIKey,
      baseUrl: (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    };
  }
  return {
    kind: 'anthropic',
    apiKey: requiredEnv('ANTHROPIC_API_KEY'),
    baseUrl: (process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com/v1').replace(/\/$/, ''),
  };
}

export function getPreferredChatModel(): string {
  if (process.env.GROQ_API_KEY) {
    return process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini';
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_MODEL ?? process.env.LLM_MODEL ?? 'claude-3-5-haiku-latest';
  }
  return process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? 'llama-3.3-70b-versatile';
}

export async function openAIChat(opts: OpenAIChatOptions): Promise<OpenAIChatResult> {
  const provider = resolveProvider();

  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? 15000;
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (provider.kind === 'anthropic') {
      const system = opts.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
      const messages = opts.messages
        .filter((message) => message.role !== 'system')
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      // Formatting tools for Anthropic (if requested) is non-trivial since their schema differs
      // significantly from OpenAI. For this implementation, we will pass tools to OpenAI only.
      // If we are using Anthropic, we will just ignore the tools parameter for now.
      const res = await fetch(`${provider.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: opts.model,
          system: system || undefined,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 700,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`LLM error (${res.status}): ${txt || res.statusText}`);
      }

      const json = (await res.json()) as any;
      const text = Array.isArray(json?.content)
        ? json.content
            .filter((item: any) => item?.type === 'text')
            .map((item: any) => String(item.text ?? ''))
            .join('\n')
            .trim()
        : '';
      const usage = json?.usage
        ? {
            inputTokens: json.usage.input_tokens,
            outputTokens: json.usage.output_tokens,
            totalTokens:
              (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
          }
        : undefined;

      return { text, usage };
    }

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 700,
        ...(opts.tools ? { tools: opts.tools } : {}),
        ...(opts.tool_choice ? { tool_choice: opts.tool_choice } : {}),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`LLM error (${res.status}): ${txt || res.statusText}`);
    }

    const json = (await res.json()) as any;
    const text = String(json?.choices?.[0]?.message?.content ?? '').trim();
    const toolCalls = json?.choices?.[0]?.message?.tool_calls;
    const usage = json?.usage
      ? {
          inputTokens: json.usage.prompt_tokens,
          outputTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
        }
      : undefined;

    return { text, usage, toolCalls };
  } finally {
    clearTimeout(t);
  }
}
