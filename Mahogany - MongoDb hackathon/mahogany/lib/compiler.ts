/**
 * Context compiler. Turns a conversation path plus recalled insights into the smallest
 * self-contained brief that answers the branch question.
 *
 * The hard requirement is referent resolution. "when do apps close?" is unanswerable without
 * knowing that "apps" means Free Ventures applications. A brief that leaves a dangling pronoun
 * cannot be answered by a model that never saw the parent — and the whole premise is that the
 * brief replaces the parent. Every fact must stand alone.
 *
 * The compiler reports its own `coverage`. That number is what the escalation ladder acts on: a
 * brief that admits it is thin gets recompiled harder before anything answers from it.
 */
import { anchorCarriedThrough, type AssembledPath } from './context';
import { complete, INTERNAL_MODEL, modelsForTier } from './providers';
import { estimateTokens, prunedPct } from './tokens';
import type { Brief, RecalledInsight } from './types';

const MAX_FACTS = 8;
const BRIEF_BUDGET_TOKENS = 800;

/** Below this the compiler is telling us the brief is thin. Escalate rather than ship it. */
export const COVERAGE_FLOOR = 0.6;

const SYSTEM = [
  'You compile minimal context briefs.',
  'Given a conversation and a branch topic, extract ONLY the facts needed to answer the branch question,',
  'ordered most load-bearing first: state the ONE fact the question most depends on first, then the rest',
  'in falling order of importance.',
  'Prefer facts a smaller model could not infer without them — the names, numbers, dates, and constraints',
  'that exist only in this conversation — over anything general knowledge already supplies.',
  'Resolve every referent so each fact stands alone without the original conversation.',
  'Never write "it", "that one", "the app" where a name belongs.',
  'Facts under "Inherited context", "Concluded in the parent branch", or "Recalled from earlier',
  'conversations" are already distilled — carry the relevant ones through rather than re-deriving them,',
  'and never contradict them.',
  'Respond with JSON only: {"facts": string[], "excludedNote": string, "coverage": number}.',
  'facts: at most 8 short self-contained sentences.',
  'excludedNote: one sentence naming what you deliberately left out.',
  'coverage: 0 to 1, your honest estimate that these facts alone suffice to answer the question.',
  'Report low coverage when the conversation genuinely does not contain the answer. Do not inflate it.',
].join(' ');

export interface CompileParams {
  path: AssembledPath;
  selection: string;
  question: string;
  recalled: RecalledInsight[];
  /** Set by the escalation ladder on retry — recompiles on a stronger model. */
  escalated?: boolean;
}

export interface CompileResult {
  brief: Brief;
  mock: boolean;
  model: string;
  latencyMs: number;
  costUsd: number;
}

export async function compileBrief(params: CompileParams): Promise<CompileResult> {
  const question = params.question.trim() || params.selection;
  const model = params.escalated
    ? (modelsForTier('thoughtful')[0] ?? INTERNAL_MODEL)
    : INTERNAL_MODEL;

  const result = await complete({
    model,
    maxTokens: 700,
    responseJson: true,
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          `Branch topic: ${params.selection}`,
          `Branch question: ${question}`,
          params.recalled.length
            ? `\nRecalled from earlier conversations:\n${params.recalled.map((r) => `- ${r.text}`).join('\n')}`
            : '',
          '',
          params.path.markdown,
        ].join('\n'),
      },
    ],
  });

  const parsed = parseCompilerOutput(result.text, params.selection);
  let facts = parsed.facts.slice(0, MAX_FACTS);

  // Referent closure across compositions. One bounded line buys self-containment at any depth.
  if (params.path.anchorFact && !anchorCarriedThrough(params.path.anchorFact, facts)) {
    facts = [params.path.anchorFact, ...facts].slice(0, MAX_FACTS);
  }

  let markdown = renderBrief({
    selection: params.selection,
    question,
    facts,
    recalled: params.recalled,
  });
  while (facts.length > 1 && estimateTokens(markdown) > BRIEF_BUDGET_TOKENS) {
    facts = facts.slice(0, -1);
    markdown = renderBrief({
      selection: params.selection,
      question,
      facts,
      recalled: params.recalled,
    });
  }

  const briefTokens = estimateTokens(markdown);

  return {
    brief: {
      markdown,
      facts,
      recalled: params.recalled,
      excludedNote: parsed.excludedNote,
      coverage: parsed.coverage,
      availableTokens: params.path.tokens,
      briefTokens,
      prunedPct: prunedPct(params.path.tokens, briefTokens),
    },
    mock: result.mock,
    model: result.model,
    latencyMs: result.latencyMs,
    costUsd: result.costUsd,
  };
}

export function parseCompilerOutput(
  text: string,
  selection: string,
): { facts: string[]; excludedNote: string; coverage: number } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const json = JSON.parse(text.slice(start, end + 1)) as {
        facts?: unknown;
        excludedNote?: unknown;
        coverage?: unknown;
      };
      // Filter to strings FIRST, then gate on the result: an array of non-strings passes a raw
      // length check but filters to empty, yielding a factless brief that skips this fallback.
      const facts = Array.isArray(json.facts)
        ? json.facts.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        : [];
      if (facts.length) {
        return {
          facts,
          excludedNote:
            typeof json.excludedNote === 'string'
              ? json.excludedNote
              : 'Excluded: the rest of the conversation.',
          coverage:
            typeof json.coverage === 'number' && json.coverage >= 0 && json.coverage <= 1
              ? json.coverage
              : 0.75,
        };
      }
    } catch {
      // fall through to the floor below
    }
  }
  console.warn('[compiler] unparseable output — using fallback');
  return {
    facts: [`Topic in focus: ${selection}.`],
    excludedNote: 'Excluded: the rest of the conversation (compiler fallback).',
    coverage: 0.3,
  };
}

function renderBrief(params: {
  selection: string;
  question: string;
  facts: string[];
  recalled: RecalledInsight[];
}): string {
  const lines = [`# Branch brief — ${truncate(params.selection, 80)}`, ''];

  if (params.recalled.length) {
    lines.push('## Recalled from earlier conversations');
    for (const r of params.recalled) lines.push(`- ${r.text} _(from "${r.sourceTitle}")_`);
    lines.push('');
  }

  lines.push('## Relevant facts', ...params.facts.map((f) => `- ${f}`), '');
  lines.push('## Question', params.question);
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
