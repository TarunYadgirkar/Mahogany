/**
 * Merge distillation: a whole branch becomes one sentence.
 *
 * The constraint is the feature. If a branch cannot be reduced to one durable line, it did not
 * conclude anything worth carrying — and a memory store that accepts paragraphs becomes another
 * transcript, which is the thing this project exists to replace.
 */
import { complete, INTERNAL_MODEL } from './providers';
import type { Branch } from './types';

const SYSTEM = [
  'You distill a finished side conversation into ONE durable sentence worth remembering months later.',
  'Keep the conclusion and the reason for it. Drop the exploration, the hedging, and the pleasantries.',
  'Resolve every referent — name the thing, do not write "it" or "that option".',
  'Write it as a standalone fact, not as a summary of a conversation.',
  'Respond with JSON only: {"insight": string}. One sentence, at most 40 words.',
].join(' ');

export async function distill(branch: Branch): Promise<string> {
  const transcript = branch.turns.map((t) => `${t.role}: ${t.text}`).join('\n');
  if (!transcript.trim()) return branch.question.slice(0, 200);

  try {
    const result = await complete({
      model: INTERNAL_MODEL,
      maxTokens: 160,
      responseJson: true,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: `Branch question: ${branch.question}\n\nWhat was said:\n${transcript}`,
        },
      ],
    });

    const slice = result.text.slice(result.text.indexOf('{'), result.text.lastIndexOf('}') + 1);
    const json = JSON.parse(slice) as { insight?: unknown };
    if (typeof json.insight === 'string' && json.insight.trim().length > 8) {
      return json.insight.trim();
    }
  } catch (err) {
    console.warn('[distill] falling back to the last assistant turn:', err);
  }

  // Falling back to the branch's own conclusion is better than refusing to merge — the user asked
  // to keep something, and losing it silently is the worst available outcome.
  const lastAssistant = [...branch.turns].reverse().find((t) => t.role === 'assistant');
  return (lastAssistant?.text ?? branch.question).slice(0, 300);
}
