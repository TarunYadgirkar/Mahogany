# DEMO.md

Three minutes on the Embarcadero Stage, then 1–2 minutes of Q&A. Two screens: the live tree on the projector, the phone or laptop running the voice call.

**The one thing the demo must prove:** stored state changed what the system *did*, not what appeared in its prompt.

---

## Before you walk up

- [ ] `/api/health` returns `ok: true` and `queryable: true`
- [ ] The seeded memory is visible in the Long-term memory panel
- [ ] The tree page is open, zoomed so nodes are readable from the back of the room
- [ ] The 60-second recording is open in another tab, one keystroke away
- [ ] Phone on Do Not Disturb, agent tested on the venue wifi

---

## The five beats

### 1 — The problem (0:00–0:30)

> "Every chatbot stores your conversation as one growing transcript. Ask a side question and you either wreck the thread you were happy with, or you open a new chat that knows nothing. And whatever you concluded — that's gone the moment you close the tab."

Start the call. Talk for two turns about a real task — choosing infrastructure for a service you're building. Let the trunk node appear on screen.

### 2 — The fork (0:30–1:15)

Say, naturally:

> "Hold on, side question — should we run our own vector index or use a managed one?"

A branch sprouts on the projector. Point at the numbers:

> "It didn't take the conversation with it. It compiled a brief — nineteen thousand tokens down to about seven hundred, ninety-six percent pruned. Every referent resolved, so a small model can answer it without ever seeing the parent."

### 3 — The recall (1:15–1:50) — **this is the beat that wins**

Point at the gold-tagged fact in the brief.

> "That fact isn't from this conversation. It's from a call I had earlier, about a completely different problem. It got merged into memory, MongoDB embedded it, and vector search pulled it back the moment it became relevant again. **This branch started warm.**"

### 4 — The route (1:50–2:20)

Read the routing reason off the screen. It will say something like *"Fireworks kept 0% of your compare questions across 3 runs, so OpenRouter takes this one."*

> "It didn't pick that model from a config file. Every branch records what happened — which provider, what it cost, and whether I kept the answer. That history is an aggregation in MongoDB, and it's what chose the model just now. The cheap route lost this category, so it doesn't get this category anymore."

### 5 — The merge, and the close (2:20–3:00)

> "Merge that and go back."

The node turns green. The line appears in the memory panel.

> "One sentence survived. The other ten messages are gone, on purpose — that's the difference between memory and a transcript."

Then the close:

> "Every chatbot gets slower, noisier, and more expensive the more you use it. This one gets cheaper and sharper, because it learns what to keep and how hard to think. Chatbots store conversations. Mahogany evolves them."

---

## Delivery notes

**Say "MongoDB" three times, tied to three different things.** Vector search for recall, the aggregation for routing, change streams for the tree. Judges are scoring depth of integration, and one mention reads as one integration.

**Don't narrate the architecture.** Nobody remembers a diagram read aloud. Show the tree moving and say what it means.

**Let one silence land** — right after the recalled fact in beat 3. That's the moment the idea arrives.

**Numbers out loud, in round terms.** "Ninety-six percent pruned." "Nineteen thousand down to seven hundred." Not "0.9612."

---

## When it breaks

**The agent doesn't fork.** Say the phrase again more plainly — "side question:" then the question. Server-side intent detection catches it even when the tool call doesn't fire.

**Recall comes back empty.** Do not debug on stage. Keep talking through beats 4 and 5, then say: *"That's live against the sandbox — here's the same run from twenty minutes ago"* and cut to the recording.

**The call drops.** Fall back to the recording immediately and narrate over it. A confident narration of a recording beats a live reconnect that eats forty seconds.

**Anything else.** Cut to the recording. Never debug in front of the room — three minutes is not enough time to recover twice.

---

## Q&A, likely questions

**"How is this different from ChatGPT branching?"**
> Branching exists. What doesn't exist is what happens after: the branch inherits a compiled brief instead of the transcript, and the conclusion merges back into a memory every future conversation can search. Branching alone still cold-starts.

**"Isn't this just RAG?"**
> RAG retrieves documents you already had. This retrieves conclusions the system reached — and it also stores whether that conclusion held up, which is what changes the routing next time. Retrieval fills a prompt; this changes a decision.

**"What happens when the compiled brief drops something important?"**
> The compiler reports its own coverage. Below a threshold, the graph loops back and recompiles on a stronger model before anything answers. And if it's still thin, the brief says what it's missing rather than guessing.

**"Why two model providers?"**
> Because the router needs something to choose between. If there's one provider, "learned routing" is a claim you can't demonstrate. With two, you can watch the choice change.
