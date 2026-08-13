/**
 * The provider seam — and the router's action space.
 *
 * Fireworks and OpenRouter are not two interchangeable logos here. They are two competing routes
 * the system chooses between using stored evidence: which one actually produced a conclusion the
 * user kept, for this kind of question, at what cost and latency. Both speak the OpenAI chat
 * completions shape, so the seam is one function and the difference is a base URL and a key.
 *
 * Every model call in Mahogany goes through `complete()`. Nothing else talks to a provider.
 */
import type { ProviderName, Tier } from './types';

export interface ModelSpec {
  id: string;
  provider: ProviderName;
  tier: Tier;
  label: string;
  /** USD per 1M tokens, in and out. Used for the cost figures recorded on every outcome. */
  inPerM: number;
  outPerM: number;
}

/**
 * The catalog. IDs drift — `npm run providers:check` proves every one of these resolves before
 * you build on it, and every id is env-overridable so a swap does not need a code change.
 */
export const MODELS: ModelSpec[] = [
  {
    id: process.env.FW_MODEL_QUICK ?? 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    provider: 'fireworks',
    tier: 'quick',
    label: 'Fireworks 8B',
    inPerM: 0.2,
    outPerM: 0.2,
  },
  {
    id: process.env.FW_MODEL_THOUGHTFUL ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct',
    provider: 'fireworks',
    tier: 'thoughtful',
    label: 'Fireworks 70B',
    inPerM: 0.9,
    outPerM: 0.9,
  },
  {
    id: process.env.OR_MODEL_THOUGHTFUL ?? 'openai/gpt-4o-mini',
    provider: 'openrouter',
    tier: 'thoughtful',
    label: 'OpenRouter mid',
    inPerM: 0.15,
    outPerM: 0.6,
  },
  {
    id: process.env.OR_MODEL_DEEP ?? 'anthropic/claude-3.5-sonnet',
    provider: 'openrouter',
    tier: 'deep',
    label: 'OpenRouter frontier',
    inPerM: 3,
    outPerM: 15,
  },
];

/** The compiler and classifier always run cheap. Cost discipline is part of the product. */
export const INTERNAL_MODEL = MODELS[0] as ModelSpec;

export function modelsForTier(tier: Tier): ModelSpec[] {
  const exact = MODELS.filter((m) => m.tier === tier);
  return exact.length ? exact : [INTERNAL_MODEL];
}

export function modelById(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}

interface ProviderConfig {
  baseUrl: string;
  key: string | undefined;
  extraHeaders?: Record<string, string>;
}

function configFor(provider: ProviderName): ProviderConfig {
  if (provider === 'openrouter') {
    return {
      baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      key: process.env.OPENROUTER_API_KEY,
      // OpenRouter attributes usage by these headers. Harmless if the app is not listed.
      extraHeaders: {
        'HTTP-Referer': process.env.PUBLIC_URL ?? 'http://localhost:3000',
        'X-Title': 'Mahogany',
      },
    };
  }
  return {
    baseUrl: process.env.FIREWORKS_BASE_URL ?? 'https://api.fireworks.ai/inference/v1',
    key: process.env.FIREWORKS_API_KEY,
  };
}

export function providerConfigured(provider: ProviderName): boolean {
  return Boolean(configFor(provider).key);
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteResult {
  text: string;
  model: string;
  provider: ProviderName;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  /** True when no key was configured and a deterministic local stand-in answered instead. */
  mock: boolean;
}

export async function complete(params: {
  messages: ChatMessage[];
  model?: ModelSpec;
  maxTokens?: number;
  temperature?: number;
  responseJson?: boolean;
}): Promise<CompleteResult> {
  const spec = params.model ?? INTERNAL_MODEL;
  const config = configFor(spec.provider);
  const started = Date.now();

  if (!config.key) return mockComplete(params.messages, spec, started);

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.key}`,
      ...(config.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: spec.id,
      messages: params.messages,
      max_tokens: params.maxTokens ?? 700,
      temperature: params.temperature ?? 0.2,
      ...(params.responseJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${spec.provider} ${res.status} on ${spec.id}: ${body.slice(0, 240)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const inputTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;

  return {
    text: json.choices?.[0]?.message?.content ?? '',
    model: spec.id,
    provider: spec.provider,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - started,
    costUsd: (inputTokens / 1e6) * spec.inPerM + (outputTokens / 1e6) * spec.outPerM,
    mock: false,
  };
}

/**
 * Keyword-ranked extractive stand-in. Deliberately not good. It exists so the whole system runs
 * with zero configuration and a missing key never looks like a crash mid-demo; every surface that
 * shows its output labels the result as mocked.
 */
function mockComplete(
  messages: ChatMessage[],
  spec: ModelSpec,
  started: number,
): CompleteResult {
  const user = messages.findLast((m) => m.role === 'user')?.content ?? '';
  const question = /Branch question:\s*(.+)/.exec(user)?.[1] ?? '';
  const keywords = new Set(
    question
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );

  const sentences = user
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 240);

  const ranked = sentences
    .map((s) => {
      const words = new Set(s.toLowerCase().split(/\W+/));
      let hits = 0;
      for (const k of keywords) if (words.has(k)) hits++;
      return { s, hits };
    })
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5)
    .map((r) => r.s);

  return {
    text: JSON.stringify({
      facts: ranked.length ? ranked : sentences.slice(0, 3),
      excludedNote: 'Excluded: the rest of the conversation (offline extractive fallback).',
      coverage: 0.5,
    }),
    model: `${spec.id} (mock)`,
    provider: spec.provider,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: Date.now() - started,
    costUsd: 0,
    mock: true,
  };
}
