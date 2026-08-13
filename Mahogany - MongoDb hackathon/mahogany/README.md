# Mahogany

**Every AI conversation starts from nothing. This one doesn't.**

A voice agent whose conversations are trees, not transcripts. Say *"hold on, side question"* and it forks — compiling a minimal brief instead of dragging the whole conversation along. Say *"merge that"* and one distilled line goes into long-term memory, where **every future conversation can recall it**.

Built at MongoDB.local Build Fest for The Persistent Context Sprint.

## The loop

**fork → compile → route → answer → merge → recall**

1. **Fork.** Speak a side question. Mahogany opens a branch off the current thread.
2. **Compile.** Instead of inheriting the transcript, the branch gets a self-contained brief: the handful of facts the question actually depends on, every referent resolved. A 19,000-token thread becomes ~700 tokens.
3. **Recall.** Before compiling, Atlas Vector Search pulls in conclusions from *previous conversations* and folds them into the brief. This is the part nobody has.
4. **Route.** The branch is sent to Fireworks or OpenRouter based on what has actually worked for this kind of question before — evidence aggregated in MongoDB, not a guess.
5. **Merge.** One durable sentence goes back to the parent and into memory. Everything else is discarded.

Then start a completely fresh call, ask something adjacent, and it already knows. That's the whole claim.

## Why this isn't "branching chat with memory"

ChatGPT and Gemini both let you branch. Branching is not the idea. What happens *after* the fork is:

| | Ordinary chatbot | Mahogany |
|---|---|---|
| Side question | Pollutes the thread, or cold-starts a new one | Forks with a compiled brief |
| Context growth | Monotonic — every turn drags the whole history | Pruned per branch, ~95% typical |
| A good answer | Indistinguishable from a bad one, once the tab closes | Merged, embedded, retrievable forever |
| Model choice | Fixed, or guessed per request | Chosen from recorded outcomes per question kind |
| New conversation | Knows nothing | Starts with what previous branches concluded |

The system gets *cheaper and better* the more you use it. That's the inversion.

## Where MongoDB is load-bearing

Not a document store with a chat log in it. Four distinct features, each doing work nothing else does:

- **Vector Search with Automated Embedding** — `insights.text` is indexed with `type: "autoEmbed"` and Voyage. Documents go in as plain text, queries go in as plain text, Atlas embeds both sides *in-database*. No embedding pipeline, no separate vector store, no third-party index to keep in sync.
- **Aggregation pipelines** — `bestRouteFor()` in [lib/outcomes.ts](lib/outcomes.ts) ranks provider/model routes by how often the user kept the conclusion, penalising corrections and breaking ties on cost. That aggregation *is* the routing decision.
- **Change streams** — the live tree on the projector moves because Atlas pushed a change, not because a timer fired. Nothing polls.
- **LangGraph checkpoints** — `MongoDBSaver` keyed by branch id, so a dropped call resumes the branch instead of losing it.

## The sponsors are the system, not a sticker sheet

**Fireworks and OpenRouter are the router's action space.** They are not two interchangeable backends behind a flag — they are the two choices the system learns between, per question kind, from stored outcomes. Ask a comparison question and watch it say *"Fireworks kept 0% of your compare questions across 3 runs, so OpenRouter takes this one."* Remove either provider and the central claim has nothing to demonstrate.

**LangGraph** runs the branch loop with a real cycle in it — a brief that reports low coverage goes back through the compiler on a stronger model before anything answers from it.

**ElevenLabs** is the interface, and voice is not a wrapper here: it is the only medium where branching is already natural. People say "hold on, side question" without being taught. The agent also shifts tone inside a branch, so you can *hear* which context you're in.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in Atlas, Fireworks, OpenRouter
npm run providers:check        # prove every model id resolves
npm run atlas:setup            # creates collections + the vector index, waits until queryable
npm run atlas:seed             # memory + routing evidence for the demo
npm run dev
```

Then open <http://localhost:3000> for the live tree, and check <http://localhost:3000/api/health> — it reports Atlas connectivity, whether the vector index is queryable, and which providers are configured. **Check it before every demo.**

To wire the voice agent, follow [scripts/elevenlabs-agent.json](scripts/elevenlabs-agent.json): point the agent's Custom LLM at `/api/chat` and register the four webhook tools.

Runs with zero API keys — the provider seam falls back to a deterministic extractive stand-in and every surface labels the result as mocked. Atlas is the one hard requirement.

## Repo map

| Path | What |
|---|---|
| [PRD.md](PRD.md) | The product, the scope cuts, the judging read |
| [DEMO.md](DEMO.md) | The stage script, beat by beat, with the failure plan |
| [PLAN.md](PLAN.md) | What's left to finish and in what order |
| [AGENTS.md](AGENTS.md) | Conventions and hard rules — read before editing |
| `lib/graph.ts` | The branch loop as a LangGraph, checkpointed to Atlas |
| `lib/recall.ts` | Cross-conversation recall. Sixty lines, and it's the product |
| `lib/outcomes.ts` | The learning substrate — record, then aggregate into a route |
| `lib/compiler.ts` | Minimal briefs with referent resolution and self-reported coverage |
| `lib/conversation.ts` | The spoken loop: fork, merge, abandon, continue |
| `app/api/chat/completions` | The ElevenLabs custom-LLM endpoint — the agent's brain |
| `app/api/tools/*` | Webhook tools the agent calls directly |
| `components/LiveTree.tsx` | The projector view, driven by change streams |

## Tests

```bash
npm test
```

Pure-function coverage of the parts that break quietly: intent detection, path composition at depth, anchor carry-through, compiler output parsing, token economics.
