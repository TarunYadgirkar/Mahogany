# CLAUDE.md

Read [AGENTS.md](AGENTS.md) first — it is the source of truth for rules and conventions. Then [PLAN.md](PLAN.md) for what is actually left to do.

Short version for a finishing session:

- The repo builds, typechecks, and passes its tests as handed over. Keep it that way — run `npm run typecheck && npm test && npm run build` before you claim anything works.
- The remaining work is wiring and verification against live services, not architecture. Resist rewriting.
- Nothing durable belongs anywhere except MongoDB Atlas.
- Every model call goes through `complete()` in `lib/providers.ts`, and every routed call records an outcome. Those two rules are what make the demo's final beat possible.
