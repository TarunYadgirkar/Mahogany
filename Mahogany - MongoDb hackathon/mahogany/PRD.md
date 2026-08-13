# Mahogany — PRD

**Every AI conversation starts from nothing. This one doesn't.**

MongoDB.local Build Fest — The Persistent Context Sprint, August 13 2026.

---

## 1. The problem

Chatbots are built on one primitive: the scrolling transcript. Everything follows from that, and all of it is bad.

- **Side questions have no good home.** Ask in the main thread and you pollute an hour of good context. Open a new chat and you re-explain everything from scratch.
- **Context only grows.** Every turn drags the entire history behind it. The conversation gets more expensive and noisier the longer it's useful.
- **Outcomes aren't recorded.** An answer you accepted and one you rejected are stored identically. The system learns nothing from either.
- **Every new conversation cold-starts.** Whatever you concluded last week is not available this week.

The result: chatbots get *worse* as systems the more you use them. The transcript is the reason.

## 2. What Mahogany is

A voice agent whose conversations are trees. Five primitives replace the transcript:

| | |
|---|---|
| **Fork** | Explore a side question without contaminating the main thread |
| **Compile** | The branch inherits only the facts it needs, every referent resolved |
| **Route** | Model and provider chosen from what has actually worked before |
| **Merge** | One validated conclusion survives; the exploration is discarded |
| **Recall** | Future conversations retrieve those conclusions semantically |

Voice is the interface because it's the only medium where branching is already natural. Nobody has to be taught to say *"hold on, side question"* — they already do it, every day, in every real conversation. The tree isn't a UI metaphor imposed on speech; it's the structure speech already has, finally written down.

## 3. Why this satisfies "No Cold Start"

The brief says stored state should *change what the system does next, not just fill the prompt*. Three mechanisms, each altering a decision rather than a context window:

| Stored in MongoDB | Changes the next run |
|---|---|
| Merged insights, vector-indexed | A new branch's brief **contains** prior conclusions — nothing gets re-derived |
| Routing outcomes per question kind | The next branch of that kind goes to a **different provider** |
| LangGraph checkpoints per branch | A dropped call **resumes** the branch instead of restarting it |

The provable moment: a brand-new session, an adjacent question, and the brief already contains a conclusion from a conversation that ended hours ago — with the routing decision citing evidence out loud.

## 4. Architecture

```
User speaks ⟷ ElevenLabs agent (turn-taking, transcription, voice, tone shift)
                     │  custom LLM  +  webhook tools
                     ▼
        /api/chat/completions  ·  /api/tools/{fork,merge,return,recall}
                     │
                     ▼
     LangGraph:  recall → compile → evaluate ⟲ escalate → route → respond → record
                     │                                      │
                     │                          Fireworks ◄──┴──► OpenRouter
                     ▼
   MongoDB Atlas:  branches · insights (autoEmbed + Vector Search)
                   routing_outcomes (aggregation → the route)
                   checkpoints (MongoDBSaver)
                     │
                     └── change streams ──► the live tree on the projector
```

**Why the compile step exists at all:** the branch is supposed to be answerable *without* the parent. That only works if every referent is resolved — "when do apps close?" is unanswerable unless the brief says *which* applications. The compiler's entire job is producing facts that stand alone, and it reports its own coverage so a thin brief gets recompiled rather than shipped.

**Why the escalation cycle is real:** low coverage sends the brief back through the compiler on a stronger model before anything answers from it. Context first, model second — and if it's still thin, the brief admits what it's missing instead of fabricating.

## 5. Technologies (judging criterion, 25%)

**MongoDB Atlas — four features, all load-bearing:**

- **Vector Search with Automated Embedding.** `insights.text` indexed as `type: "autoEmbed"` with Voyage. Insert plain text, query plain text, embeddings generated in-database. No pipeline, no external vector store.
- **Aggregation pipelines.** `bestRouteFor()` ranks routes by kept-conclusion rate, penalises corrections, breaks ties on cost. The aggregation *is* the routing decision.
- **Change streams.** The projector tree moves because Atlas pushed a change. Nothing polls.
- **LangGraph checkpoints** via `MongoDBSaver`, keyed by branch id.

**Fireworks + OpenRouter** are the router's action space, not two backends behind a flag. The system learns which one earns which question kind, and says so aloud.

**LangGraph** runs the loop, including a genuine cycle (`compile → evaluate → escalate → compile`).

**ElevenLabs** is the interface, plus the tone shift that makes branch depth audible — which is the interaction-design novelty, not a mic button.

## 6. Scope

**Must ship** — the demo does not exist without these:
- Voice → fork → compiled brief → spoken answer → merge, end to end
- Cross-session recall, visibly tagged with its source
- Routing that cites stored evidence
- The live tree moving off change streams

**Should ship:** escalation on low coverage · the evidence panel · abandon as a negative signal

**Stretch, cut at 4:15 sharp:** tone shift per depth · LangSmith traces · hybrid `$rankFusion` recall · insight flight animation

**Explicitly cut:** authentication, multi-user, a chat UI of our own, settings screens, mobile layout.

## 7. Success criteria

1. A branch in a session that never mentioned topic X contains a fact about X merged from a different session. Live.
2. The brief is under 1,000 tokens against a parent over 15,000, and the answer is correct — no dangling referents.
3. Two consecutive question kinds route to *different providers*, each with a spoken reason drawn from stored outcomes.
4. Everything survives hanging up and calling back, because it lives in Atlas.

## 8. Honest risks

- **Voice adds failure modes.** Mitigated by server-side intent detection when the agent skips a tool call, and by a recorded fallback for the stage.
- **`autoEmbed` is recent.** If the sandbox rejects it, AGENTS.md has a twenty-minute manual-embedding fallback.
- **Model ids drift.** `npm run providers:check` proves all four in thirty seconds; every id is env-overridable.
- **Latency.** Recall + compile + route + answer is four sequential calls. Compile and classify both run on the cheap model deliberately. If a branch feels slow on stage, say the number out loud — the pruning is the reason it isn't slower.
