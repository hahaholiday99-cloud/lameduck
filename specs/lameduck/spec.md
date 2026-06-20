# lameduck — Spec

> **Source of truth:** the design document at [`docs/designs/lameduck-design.md`](../../docs/designs/lameduck-design.md). This file is a pointer + scope summary for the implementer.
>
> **Repo location:** `.pi/extensions/lameduck/` (multi-file TypeScript)

## What we're building

A `pi` extension that registers the `/lameduck` slash command. It reads
`specs/<feature>/backlog.md`, and for every open task it:

1. Creates a stacked git branch off the base branch
2. Spawns in-task subagents in parallel or sequence
   (architecture → implement → coverage → security, plus design on
   frontend tasks)
3. Enforces an 80% test coverage gate (configurable)
4. Commits the changes on the stacked branch
5. Spawns the post-commit review subagents (open-code-review, then
   thermo-nuclear-code-quality-review)
6. Writes per-task review + report, plus per-run report
7. Pauses for human approval
8. On approval, flips the task to `[x]` in `backlog.md` and moves on

## Scope of this spec (the build)

- v1 scope as approved in §11 of the design doc
- See `tasks.md` for the 16 implementation tasks

## What is explicitly out of scope (v1)

- `--budget-usd` budget gate (deferred to v2)
- Subagent sandboxing
- Multi-host coordination
- Auto-merge of stacked branches

## Reference implementation to learn from (not to copy)

- `.pi/extensions/ai-workflow.ts` (2,999 lines, monolithic) — read for
  behaviour, NOT for structure. lameduck is the modular replacement.

## Skills used by subagents (read-only inputs to the workflow)

| Role | Skill path |
|---|---|
| `design` | `.pi/skills/impeccable/` |
| `architecture` | `.pi/skills/improve-codebase-architecture/` |
| `implement` | `.pi/skills/tdd/` |
| `coverage` | `.pi/skills/tdd/` |
| `security` | `.pi/skills/semgrep/` |
| `review` | `.pi/skills/open-code-review/` |
| `thermoNuclear` | `.pi/skills/thermo-nuclear-code-quality-review/` |
