/**
 * Routes intelligence, not just models.
 *
 * Two stages, and the order is the whole argument. A cheap classifier picks a baseline tier from
 * the question and the brief. Then stored evidence — this user's actual outcomes for this KIND of
 * question — can override which provider and model runs it. Fireworks and OpenRouter are the
 * choices; MongoDB holds the record of which one earned the work.
 *
 * A route chosen from evidence says so, out loud, in `reason`. That sentence is the demo.
 */
import { bestRouteFor } from './outcomes';
import { complete, INTERNAL_MODEL, modelById, modelsForTier, providerConfigured } from './providers';
import { traced } from './trace';
import type { Brief, ProviderName, QuestionKind, Routing, Tier } from './types';
import { QUESTION_KINDS, TIER_ORDER } from './types';

const CLASSIFIER_SYSTEM = [
  'Classify a question for an inference router. Respond with JSON only:',
  '{"kind": one of ["factual","compare","analyze","plan","rewrite","code"],',
  '"tier": one of ["quick","thoughtful","deep"]}.',
  'quick: a lookup, or one fact restated. thoughtful: reasoning over several facts.',
  'deep: multi-constraint synthesis, tradeoffs, or a question where being wrong is expensive.',
  'Judge the QUESTION, not the length of the context it sits on.',
].join(' ');

async function decideRoute(params: {
  userId: string;
  question: string;
  brief: Brief;
}): Promise<Routing> {
  const classified = await classify(params.question, params.brief);
  const evidence = await bestRouteFor(params.userId, classified.kind);

  if (evidence) {
    const spec = modelById(evidence.model);
    if (spec && providerConfigured(spec.provider)) {
      return {
        tier: spec.tier,
        provider: spec.provider,
        model: spec.id,
        questionKind: classified.kind,
        fromEvidence: true,
        reason:
          `${spec.label} has kept ${Math.round(evidence.successRate * 100)}% of your ` +
          `${classified.kind} questions across ${evidence.samples} runs, so it gets this one.`,
      };
    }
  }

  const spec = pickForTier(classified.tier);
  return {
    tier: spec.tier,
    provider: spec.provider,
    model: spec.id,
    questionKind: classified.kind,
    fromEvidence: false,
    reason: `${baselineReason(classified.tier, classified.kind)} No history yet, so ${spec.label} takes it.`,
  };
}

/**
 * Traced as its own run so the decision — and `fromEvidence` in particular — is visible next to
 * the call it produced. Comparing a cold trace against a warm one is how the learning loop is
 * shown rather than described.
 */
export const route = traced(decideRoute, { name: 'route' });

/** Pick a configured model for a tier, degrading down the ladder rather than failing. */
export function pickForTier(tier: Tier) {
  const configured = modelsForTier(tier).filter((m) => providerConfigured(m.provider));
  if (configured[0]) return configured[0];

  for (let i = TIER_ORDER.indexOf(tier) - 1; i >= 0; i--) {
    const t = TIER_ORDER[i];
    const fallback = t ? modelsForTier(t).find((m) => providerConfigured(m.provider)) : undefined;
    if (fallback) return fallback;
  }
  // Nothing configured at all: the mock path answers, and every surface labels it as mocked.
  return INTERNAL_MODEL;
}

/** One cheap call. Cost discipline is the product — the classifier never runs on a big model. */
async function classify(
  question: string,
  brief: Brief,
): Promise<{ kind: QuestionKind; tier: Tier }> {
  try {
    const result = await complete({
      model: INTERNAL_MODEL,
      maxTokens: 60,
      responseJson: true,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM },
        {
          role: 'user',
          content: `Question: ${question}\n\nFacts available:\n${brief.facts.map((f) => `- ${f}`).join('\n')}`,
        },
      ],
    });
    const slice = result.text.slice(result.text.indexOf('{'), result.text.lastIndexOf('}') + 1);
    const json = JSON.parse(slice) as { kind?: string; tier?: string };
    return {
      kind: QUESTION_KINDS.includes(json.kind as QuestionKind)
        ? (json.kind as QuestionKind)
        : heuristicKind(question),
      tier: TIER_ORDER.includes(json.tier as Tier) ? (json.tier as Tier) : 'thoughtful',
    };
  } catch {
    // A classifier hiccup must never block a branch mid-conversation.
    return { kind: heuristicKind(question), tier: question.length > 140 ? 'thoughtful' : 'quick' };
  }
}

export function heuristicKind(question: string): QuestionKind {
  const q = question.toLowerCase();
  if (/\b(vs|versus|compare|better|instead of|or should)\b/.test(q)) return 'compare';
  if (/\b(analyz|why|implication|tradeoff|assess|risk)/.test(q)) return 'analyze';
  if (/\b(plan|should i|next step|roadmap|order|prioriti)/.test(q)) return 'plan';
  if (/\b(rewrite|reword|shorten|tone|draft|phrase)\b/.test(q)) return 'rewrite';
  if (/\b(code|function|bug|error|api|typescript|python|schema)\b/.test(q)) return 'code';
  return 'factual';
}

function baselineReason(tier: Tier, kind: QuestionKind): string {
  const why: Record<Tier, string> = {
    quick: 'a lookup answerable straight from the brief',
    thoughtful: 'reasoning over several facts in the brief',
    deep: 'multi-constraint synthesis where a wrong answer is expensive',
  };
  return `Classified as a ${kind} question — ${why[tier]}.`;
}

/** Which provider the user pushed toward. Recorded so evidence accrues to the right route. */
export function otherProvider(p: ProviderName): ProviderName {
  return p === 'fireworks' ? 'openrouter' : 'fireworks';
}
