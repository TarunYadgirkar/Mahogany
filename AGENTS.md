# AGENTS.md — Mahogany

Source of truth for anyone editing this repo, human or agent. Read [PRD.md](PRD.md) for what the product is, [PLAN.md](PLAN.md) for what's left, [DEMO.md](DEMO.md) for what has to work on stage.

## Hard rules

1. **All model calls go through `complete()` in `lib/providers.ts`.** No direct fetches to Fireworks, OpenRouter, or anything else. The router's choice between providers is the product's central claim; a call that bypasses the seam is a call that never gets recorded, and an unrecorded call teaches the router nothing.
2. **Every routed call writes a `routing_outcomes` document.** If you add a path that answers without recording, the learning loop silently stops learning and the demo's final beat stops working. `lib/graph.ts` does this in the `record` node — keep it there.
3. **Recall failure is never fatal.** A missing or still-building vector index must degrade to an empty recall list, not a 500. See the try/catch in `lib/recall.ts`. The brief is still useful without recall; it just isn't the demo.
4. **The voice loop never hangs.** Any error in `/api/chat/completions` must still return speech. Dead air on stage reads as a crash; a spoken "say that again?" does not.
5. **The sandbox cluster is the only cluster.** `MONGODB_URI` points at the hackathon Atlas sandbox. Submission eligibility depends on it.
6. **Never commit `.env.local`.** `.gitignore` covers it. Do not override.
7. **Spoken text leaves through `speakAs()` in `lib/voice.ts`.** It picks the ElevenLabs voice label from branch depth and strips existing tags before adding one, because a nested tag gets read out as literal angle brackets. With `VOICE_LABEL_*` unset it is a pass-through — which means a route that skips it looks correct locally and silently loses the tone shift on stage.

## Conventions

- TypeScript strict, with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` on. Index access returns `T | undefined`; optional properties must be spread conditionally (`...(x ? { x } : {})`) rather than assigned `undefined`.
- Comments explain **why**, never what. Most functions need none. The ones that survived a bug deserve one.
- Conventional commits, short imperative subject. No trailers, no generated-by footers.
- Prefer editing an existing file over adding one.
- No error handling for impossible scenarios. Do handle: Atlas unreachable, index still building, provider 4xx, the agent not calling a tool. All four happen.

## Architecture in one paragraph

ElevenLabs handles turn-taking, transcription, and voice, then calls `/api/chat/completions` — an OpenAI-shaped endpoint that is really the branch loop. `lib/conversation.ts` decides whether the utterance forks, merges, abandons, or continues. A fork runs `lib/graph.ts`: recall past insights by vector search, compile a minimal brief, evaluate its coverage (looping back through a stronger compile if it's thin), pick a provider from aggregated outcomes, answer, record the outcome. `lib/branches.ts` writes the tree to Atlas, which change streams push to the live page. A merge distills one line into `insights`, where Atlas auto-embeds it and every future branch can retrieve it.

## The four things that break most often

**The vector index is not queryable yet.** `createSearchIndex` returns immediately; the index takes 1–3 minutes to build. Querying before then returns zero results with no error — indistinguishable from "recall doesn't work." `npm run atlas:setup` polls until `queryable`, and `/api/health` reports it. Check both before concluding recall is broken.

**A LangGraph node shares a name with a state channel.** LangGraph rejects this at graph-construction time, and because construction happens at module load, it surfaces as a *build* failure with a stack trace pointing at an unrelated route. That's why the answer node is called `respond`. If you add a node, don't name it after a channel.

**Model ids drift.** Both providers rename and retire ids. `npm run providers:check` proves all four resolve in about thirty seconds. Every id is env-overridable, so a swap never needs a code change.

**The agent doesn't call the tool.** ElevenLabs agents skip webhook tools sometimes, especially under interruption. `lib/intent.ts` detects fork/merge/abandon intent server-side as a backstop, so the loop still works. Keep both paths — do not "simplify" by deleting one.

## If Automated Embedding is unavailable

If the sandbox cluster rejects `type: "autoEmbed"`, switch to manual embeddings rather than dropping recall:

1. In `scripts/setup-atlas.mjs`, change the field to `{ "type": "vector", "path": "embedding", "similarity": "cosine", "dimensions": 768 }`.
2. Embed `text` on insert in `lib/branches.ts` (`merge`) and embed the query in `lib/recall.ts`, both through `lib/providers.ts`.
3. In `lib/recall.ts`, replace `query: params.query` with `queryVector: <number[]>`.

About twenty minutes. Don't attempt it before confirming `autoEmbed` actually failed — the automated path is a genuine differentiator and the fallback is not.

## If LangGraph fights you

The nodes are deliberately thin. `runBranch()` can be replaced by calling `recallInsights`, `assemblePath`, `compileBrief`, `route`, `complete`, and `record` in that order, and nothing else in the codebase changes. You lose checkpointing and the escalation cycle; you keep the demo. Do this only if the graph is actually blocking you — the cycle and the checkpointer are both real, working, and worth points.

## Traces

`complete()` and `route()` are `traceable` wrappers around `runComplete` and `decideRoute` (`lib/trace.ts`), so each provider call and each routing decision is its own LangSmith run under the graph's `branch` run. Export the wrapper, never the inner function — an import of the raw one still works and still answers, it just vanishes from the trace. With `LANGCHAIN_TRACING_V2` off, `traceable` calls straight through and costs nothing.

## Running without keys

With no `FIREWORKS_API_KEY` or `OPENROUTER_API_KEY`, `lib/providers.ts` returns a deterministic extractive stand-in and marks the result `mock: true`. The whole loop is exercisable this way. Atlas is the one thing with no fallback.

## Ongoing

**Lane A — critical path. Owns `main`.** Atlas setup → smoke gate → voice wiring → deploy. Opus 5, high effort, no worktree isolation. Other lanes: branch, do not push to `main`.

Done: repo cloned to `~/TarunsCode/hackathons/mahogany-mongodb/repos/Mahogany`. Source flattened to the repo root and ignore rules restored (`33b44e7`) — the upload commit had buried everything two levels deep under a zip of itself and dropped the dotfiles. `npm install` done on node 24.18. `npm run typecheck` clean, 21/21 tests pass.

Blocked: local secrets file is not filled in, so PLAN.md Phase 1 has not started. `next build` fails at page-data collection for `/api/tools/fork` with `MONGODB_URI is not set` — expected, not a regression. Nothing in Phase 1 onward can run until the Atlas URI and both provider keys are in place.

Next, in order: `npm run providers:check` (all four ids must print OK), `npm run atlas:setup` (wait for `vector index is queryable`), `npm run atlas:seed`, `/api/health`, then the fork smoke curl. **Gate: `recalled > 0` before Phase 2.**
