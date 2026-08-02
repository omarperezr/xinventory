# xinventory

Inventory/POS for Venezuelan retail. Prices stored in **USD**; bolivar amounts
derived via a rate. Offline-first PWA. Supabase (Postgres + RLS) is the only
backend — no server of ours. Sold as isolated per-client instances with
build-time paid modules.

## Invariants (breaking one is a money bug, not a style bug)

- Every price is USD. Bs is derived, never stored as the source of truth.
- One rate is **honest** (normally USDT); all bookkeeping uses it. The others
  are reference lenses — while one is selected, money entry is blocked.
- Sales and finance entries **snapshot** their cost and rate at write time.
  Nothing may restate a past row: not a rate change, not a cost edit, not a
  description fix.
- Stock moves only through the server RPCs (`increment_stock`,
  `decrement_stock`, `return_transaction_item`). Never write `items.quantity`
  from the client; queue **deltas**, never absolute quantities.
- RLS + guard triggers are the access layer. The client is untrusted; UI gating
  is not security.
- Writes queue in the outbox and must replay idempotently.

## Working rules

- Trace the real flow before editing. The smallest diff in the wrong place is a
  second bug.
- Fix at the shared function every caller routes through, not at the caller the
  report named.
- Money, auth, and data-loss paths get no shortcuts. Everything else: laziest
  thing that works.
- Non-trivial logic leaves one runnable check behind. No frameworks.
- `npx tsc --noEmit` must be clean before you call anything done.

## graphify — ask the graph before you grep

This repo has a built knowledge graph in `graphify-out/`. It answers "how does
X work", "what calls Y", "what connects A to B" from an index instead of from
a search that pulls file contents into context. **Reach for it first** — that
is the single cheapest way to orient in this codebase.

```
graphify query "how does an offline sale reach the server"   # BFS, broad context
graphify query "..." --dfs                                   # trace one path
graphify query "..." --budget 1500                           # cap the answer
graphify path "OfflineSync" "decrement_stock"                # shortest path between two things
graphify explain "buildFinanceReport"                        # plain-language node summary
```

`graphify-out/GRAPH_REPORT.md` names the communities, the god nodes
(`useApp`, `useAuth`, `useFinance`, `isOnline`, `InventoryItem`) and the
cross-module bridges. Read it once when the question is "where does this
live", instead of listing directories.

Rebuild after a structural change (new files, moved modules), not after every
edit: `/graphify . --update`. The graph is stale, not wrong — verify any file
or symbol it names still exists before acting on it.

## Delegation

The orchestrator's job is to decide, dispatch, and judge — not to read. Every
file it reads itself stays in context for the rest of the session; every file a
subagent reads is discarded when that subagent returns. Delegate discovery,
keep conclusions.

**Who orchestrates.** Fable, when the shape of the work is unknown —
investigation, review, architecture, anything where the decomposition is the
hard part. A wrong split costs N subagent runs, not one answer. Opus 5 when the
work list is already enumerated and dispatch is mechanical.

**Model per task** — start at the cheapest tier that can hold the invariants
above, escalate on failure. Never the reverse.

| Tier | Use for |
|------|---------|
| Haiku 4.5 | Mechanical, verifiable: renames, formatting, "where is X defined", log scraping, single-file lookups |
| Sonnet 5 | Implementation against a spec that is already written down |
| Opus 5 | Multi-file features and refactors, code review, mechanical orchestration |
| Fable | Architecture, money/auth/data-loss correctness, final QA, ambiguous decomposition |

**Dispatch rules.**

- Send independent agents in **one message** so they run in parallel.
- Give each agent **exclusive file ownership** and name the files the others
  own. Parallel agents editing one file corrupt each other's work.
- Specify the **return format** and keep it small: one line per finding or per
  fix. An agent that returns file contents has wasted the delegation.
- State the invariant the agent must not break, not just the task. It cannot
  see this file's context unless you paste it.
- Require re-verification against the actual lines before reporting, and a
  concrete failure scenario per finding. Plausible-sounding bugs are the main
  failure mode of parallel review.

**Do it inline instead** when you already know the file and the symbol, or
when `graphify query` already answered it — a single lookup is cheaper than a
subagent round trip.

## Layout

- `src/app/context/` — app (inventory, cart, rates), history (sales), finance,
  social, auth. The contexts are the data layer; components are views.
- `src/app/utils/offlineStore.ts` — cache, outbox, replay. Every write goes
  through here.
- `src/app/services/` — analytics (reports, finance), export, exchange rates.
- `supabase/migrations/` — schema, RLS, guard triggers, RPCs. The real rules.
- `api/` — Vercel functions: usdt-rate, social-generate (cron), storage-cleanup
  (cron).
- `scripts/new-client.sh` — one-command client provisioning.

Module flags (`VITE_MODULE_FINANZAS|REPORTES|REDES`) gate at **build time**:
the code leaves the bundle. `MODULE_REDES` gates the server endpoint
separately. A client only gets the migrations for the modules they bought.
