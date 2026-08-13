# PLAN.md — the last 5%

Everything in `lib/`, `app/`, `components/`, `scripts/`, and `test/` is written. It typechecks, the 21 tests pass, and `next build` compiles all ten routes. What's left needs live services and a browser — nothing here is architecture.

Hacking runs **1:30–5:00 PM**. Submissions at 5:00. Finalists 6:30.

---

## Phase 0 — Before the clock (do this while waiting)

- [ ] Create the project + cluster through the **Atlas Hackathon Sandbox** link in your email. Nothing else counts.
- [ ] Claim Fireworks credits (`MONGODB813`) and OpenRouter credits.
- [ ] Create an ElevenLabs agent. Grab the API key.
- [ ] `npm install`
- [ ] `cp .env.example .env.local`, fill `MONGODB_URI`, `FIREWORKS_API_KEY`, `OPENROUTER_API_KEY`
- [ ] Push to a **public** GitHub repo.

## Phase 1 — Backend live (1:30–2:15)

- [ ] `npm run providers:check` — all four model ids must print `OK`. If any fails, browse the provider's model list and update `.env.local`. **Do not skip this.**
- [ ] `npm run atlas:setup` — wait for `vector index is queryable`
- [ ] `npm run atlas:seed`
- [ ] `npm run dev`, then `curl localhost:3000/api/health | jq` — expect `ok: true`, `queryable: true`, both providers `true`
- [ ] Smoke the whole loop without a microphone:

```bash
curl -s localhost:3000/api/tools/fork -H 'content-type: application/json' \
  -d '{"question":"should we use a managed vector index or run our own?","session_id":"smoke"}' | jq
```

Expect a compiled brief, a `prunedPct`, a `recalled` count **greater than zero** (the seeds), and a routing `reason`.

**Gate: do not proceed until `recalled > 0`.** That number is the demo.

## Phase 2 — The live tree (2:15–2:45)

- [ ] Open <http://localhost:3000> — the trunk and the smoke branch should already be there
- [ ] Run the fork curl again and watch a node appear **without refreshing**. If it doesn't, the change stream is the problem — check the browser console and `/api/health`.
- [ ] Merge and watch the node turn green:

```bash
curl -s localhost:3000/api/tools/merge -H 'content-type: application/json' \
  -d '{"session_id":"smoke","insight":"Managed vector search wins — we cannot install extensions on the target host."}' | jq
```

- [ ] Confirm the merged line appears in the **Long-term memory** panel

## Phase 3 — Voice (2:45–3:45)

This is the phase most likely to eat time. Budget accordingly, and keep the curl path working as a fallback demo.

- [ ] Deploy to Vercel, set all env vars there, note the URL
- [ ] In the ElevenLabs dashboard, follow [scripts/elevenlabs-agent.json](scripts/elevenlabs-agent.json):
  - Custom LLM server URL → `https://YOUR-APP.vercel.app/api/chat` (ElevenLabs appends `/completions`)
  - Register all four webhook tools with your `TOOL_SECRET`
  - Paste the system prompt and first message
- [ ] Set `TOOL_SECRET` in Vercel and in the tool headers — these routes mutate the tree, and an open public URL means anyone in the room can fork into your demo
- [ ] Call the agent. Say *"hold on, side question — should we run our own vector index?"*
- [ ] Confirm: it forks, the tree moves, the answer comes back spoken
- [ ] Say *"merge that and go back"* — confirm the node turns green and memory grows

If the agent won't call `fork_branch`, don't fight it — `lib/intent.ts` catches the phrase server-side and the loop still works. Note it and move on.

## Phase 4 — The proof beat (3:45–4:15)

The demo's whole argument is that stored state changes behavior. Rehearse exactly this:

- [ ] Start a **new session** (`session_id` differs — hang up and call again)
- [ ] Ask an adjacent question that was never mentioned in this session
- [ ] Confirm the brief contains a recalled fact from the earlier session, tagged with its source
- [ ] Ask a **comparison** question and confirm the routing reason cites evidence — the seeds make Fireworks look bad at `compare`, so it should pick OpenRouter and say why

## Phase 5 — Record and rehearse (4:15–4:45)

- [ ] **Record a 60-second screen capture of the working demo now, while it works.** It is both the submission video and your stage fallback.
- [ ] Rehearse [DEMO.md](DEMO.md) out loud twice, with a timer
- [ ] Take a screenshot of the live tree mid-demo for the submission

## Phase 6 — Submit (4:45–5:00)

- [ ] Repo public
- [ ] Video link opens in an incognito window
- [ ] All teammates added on the submission page
- [ ] Submit at <https://cerebralvalley.ai/e/persistent-context-sprint-hackathon/submit>

---

## Stretch, in the order worth attempting

1. **Tone shift per branch depth** — a second ElevenLabs voice id for branch mode. Highest payoff for the ElevenLabs prize, roughly 20 minutes, and it is the detail nobody else will have.
2. **LangSmith traces** — set `LANGCHAIN_TRACING_V2=true` and show two traces side by side: cold run picks the cheap route, warm run picks differently because of stored evidence. That is the learning claim *proven*.
3. **Hybrid recall** — `$rankFusion` over Atlas Search + vector for typo tolerance on transcribed speech, which is where exact-match retrieval actually hurts.
4. **Insight flight animation** — the merged line visibly travelling from branch to trunk.

## Cut without hesitation

Everything in the stretch list, at 4:15 PM sharp. A rehearsed three-minute demo of the core loop beats an unrehearsed one with four extra features in it.

## Known gaps handed over deliberately

- **Single tenant.** One `DEMO_USER_ID`. Auth is not the interesting part and a login screen in a three-minute demo is a three-minute demo with a login screen in it.
- **`continueTurn` always runs on the cheap model.** Trunk conversation is not routed — only branches are. Routing the trunk would add cost without adding anything the demo shows.
- **Streaming is chunk-per-sentence, not token-by-token.** The graph produces a complete answer before speech begins. Real token streaming would mean streaming through the whole graph; the latency win is not worth that complexity today.
- **No regeneration signal.** `regenerated` is recorded but never set true — there's no "say that again differently" path yet. The field is there so adding one is a one-line change.
