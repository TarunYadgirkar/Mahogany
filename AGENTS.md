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

**Phases 1 and 2 are done and verified.** Atlas set up, `insight_recall` built to READY, seeded 3 insights and 10 outcomes. `/api/health` returns `ok: true`. The fork smoke passed the gate at `recalled: 3`, `fromEvidence: true`, `mock: false`. The live tree streams new nodes without a refresh, a merge turns the node green, and the merged line lands in the memory panel. Verified against a real cluster and real Fireworks calls, not mocks.

All lanes are merged into `main`. Lane C branched from the pre-flatten upload commit, so it came in through rename detection (`8e4a654`); lane D's tree work and the checker change had to be recovered from an unpushed local branch after `main` was rolled back to `d769591`. 31 tests pass, typecheck clean.

**Both Fireworks Llama ids are retired** — the account serves 24 ids and none are Llama. Now on `gpt-oss-20b` (quick) and `gpt-oss-120b` (thoughtful). On OpenRouter, `anthropic/claude-3.5-sonnet` is gone from the catalog; now `claude-haiku-4.5` and `claude-sonnet-5`. When ids drift again, `npm run providers:check` prints every id the key can actually reach.

All four model ids now resolve on both providers, and `TOOL_SECRET` is set — `/api/health` reports `toolSecret: true` and an unauthenticated `POST /api/tools/fork` correctly returns 401. Which means **an agent without the secret can no longer smoke-test the tool routes.** To call them, read the secret out of the local file at call time rather than pasting it anywhere:

```bash
S=$(grep '^TOOL_SECRET=' .env.local | cut -d'"' -f2)
curl -s localhost:3000/api/tools/fork -H "x-mahogany-secret: $S" \
  -H 'content-type: application/json' -d '{"question":"...","session_id":"..."}' | jq
```

**Never re-run `cp .env.example .env.local`.** It overwrites a filled file with placeholders, which cost this lane a Phase 1 re-verify. Open the existing file to edit it. If it was written in TextEdit, confirm Smart Quotes was off — curly quotes become part of the value and read as an invalid key.

`npm run atlas:reset` clears the branch tree so the stage opens on a bare trunk, keeping seeded insights and routing evidence. `-- --all` clears those too and forces a re-seed plus another embedding wait.

**Deploy (Phase 3).** Linked to Vercel as `taruns-projects-248def65/mahogany` (`.vercel/` is gitignored, so each clone links itself). The directory is capitalized and Vercel rejects that as a project name — pass `--project mahogany` to `vercel link`, don't let it infer. `npx next build` passes locally against real values: 10 routes, 105 kB First Load JS.

The first production deploy cannot succeed until the environment variables exist in Vercel — `next build` collects page data, which constructs the Mongo client, which throws without `MONGODB_URI`. Set them there, deploy, then set `PUBLIC_URL` to the deployment URL and redeploy, since the URL isn't knowable until the first deploy lands.

A local dev server runs on **port 3002**, not 3000 — 3000 was occupied. Anything hardcoding 3000 locally needs adjusting.

Then Phase 4's proof beat — new session, adjacent question, confirm a recalled fact with its source, then a comparison question that should route to OpenRouter and cite evidence.
