/**
 * LangSmith tracing, on a switch.
 *
 * LangGraph already traces itself once `LANGCHAIN_TRACING_V2=true` is set, so the node path shows
 * up for free. What does not show up for free is the part worth projecting on stage: which model
 * answered, what it cost, and whether the router chose it from stored evidence or from the
 * classifier. Those are plain `fetch` calls and a plain function, so they get wrapped here.
 *
 * The whole point is two traces side by side — a cold run picking the cheap route, a warm run
 * picking differently because outcomes accumulated in between. That is the learning claim, proven
 * rather than asserted.
 *
 * With tracing off, `traceable` calls straight through. Nothing here needs a key to be safe.
 */
import { traceable } from 'langsmith/traceable';

export const TRACING_ENABLED = /^(1|true|yes)$/i.test(
  process.env.LANGCHAIN_TRACING_V2 ?? process.env.LANGSMITH_TRACING ?? '',
);

type AnyFn = (...args: never[]) => Promise<unknown>;

/** Wrap an async function as one LangSmith run. Name and run type show up in the trace tree. */
export function traced<T extends AnyFn>(
  fn: T,
  options: { name: string; runType?: 'llm' | 'chain' | 'tool' },
): T {
  return traceable(fn, {
    name: options.name,
    run_type: options.runType ?? 'chain',
  }) as unknown as T;
}
