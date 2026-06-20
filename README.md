# lameduck

> **A modular `pi` extension — ai-workflow replacement.**
> Reads `specs/<feature>/backlog.md`, spawns stacked-diff subagents per
> task, enforces a coverage gate, writes per-task reviews + reports,
> pauses for human approval, and flips the backlog on approval.

Source: [`index.ts`](./index.ts) · TypeScript · 14 modules + 81 tests · no runtime deps beyond `node:*` + `@earendil-works/pi-coding-agent`.

---

## What it does

`/lameduck [<feature>] [T001 …] [flags]` for every open task in
`specs/<feature>/backlog.md`:

1. Creates a **stacked git branch** off the base branch
2. Spawns **in-task subagents** (`architecture`, `implement`, `coverage`,
   `security`, optionally `design` on frontend tasks) — sequential or
   parallel
3. Enforces an **80% test coverage gate** (configurable)
4. Commits the changes on the stacked branch
5. Spawns the **post-commit review subagents** (`open-code-review` then
   `thermo-nuclear-code-quality-review`)
6. Writes the per-task review and consolidated report
7. **Pauses for you to approve / reject**
8. On approval, flips `[ ]` → `[x]` in `backlog.md` and moves on

---

## Architecture (14 modules)

```
index.ts                  ← registers /lameduck, wires the modules
├── schema/
│   ├── args.ts           ← ParsedArgs + parseArgs() + tokenize() + helpText()
│   ├── task.ts           ← Task + isTaskId()
│   ├── roles.ts          ← RoleDef registry + resolveInTaskRolesForTask()
│   └── run-state.ts      ← RunState, RunPhase, SubagentResult, TokenUsage, …
├── resolver/
│   └── backlog.ts        ← parseBacklogMd() + flipTaskDone() + buildBacklogFromTasks()
├── subagent/
│   ├── parser.ts         ← parseSubagentEvents() + extractCoveragePct()
│   └── runner.ts         ← spawnPi + withRetry + resolvePiBin + buildSubagentPrompt
├── git/
│   └── index.ts          ← ExecAdapter port + GitOps (ShellExecAdapter + RecordingExecAdapter)
├── artifacts/
│   └── writer.ts         ← FsAdapter port + writeReview / writeReport / writePerRun / ledger
├── ui/
│   └── prompt.ts         ← UiAdapter port (PiUiAdapter + ScriptedUiAdapter)
├── state/
│   ├── machine.ts        ← 24-phase explicit FSM + buildPlan() + tick()
│   └── gates.ts          ← checkCoverageGate + checkConsentGate
├── resume/
│   └── index.ts          ← HandoverSnapshot ↔ RunState + parseHandover/serialize
└── security/
    └── contract.ts       ← parseSecurityReport + formatSecurityReport + scoreSeverity
```

Every I/O side effect goes through a **port** (ExecAdapter, FsAdapter,
UiAdapter) with a `node`-flavoured default and a `memory`/`recording`
flavour for tests.

---

## CLI reference

```text
/lameduck [<feature>] [--path <file>] [--role r1,r2] [T001 T005 …] [flags]
```

| Flag | Default | Purpose |
|---|---|---|
| `<feature>` | picker | Directory under `specs/` |
| `--path <file>` | `specs/<feature>/backlog.md` | Override backlog path |
| `--role <list>` | all 4 in-task | Comma subset of in-task roles |
| `--parallel` / `--sequential` | sequential | Run in-task subagents concurrently |
| `--model <pattern>` | inherit | Forwarded to every subagent |
| `--thinking <lvl>` | inherit | `off\|minimal\|low\|medium\|high\|xhigh` |
| `--coverage-threshold <n>` | `80` | 0..100; 0 disables |
| `--base-branch <name>` | `main` | Where stacked branches fork from |
| `--branch-prefix <p>` | `feat/<feature>/` | Branch name prefix |
| `--auto-approve` | `false` | Skip human review gate (CI mode) |
| `--no-post-review` | review ON | Skip `open-code-review` |
| `--no-thermo-nuclear` | thermo ON | Skip thermo-nuclear |
| `--no-design` / `--no-architecture` / `--no-implement` / `--no-coverage` / `--no-security` | ON | Per-role opt-out |
| `--force-design` | frontend-gated | Always spawn `design` |
| `--dry-run` | `false` | Resolve, print the plan, exit (no writes) |
| `--help`, `-h` | – | Show help |

---

## Roles

Seven roles, each bound to a skill shipped under `.pi/skills/<skillDir>` or
`~/.pi/agent/skills/<skillDir>`:

| Role | Emoji | Phase | Skill |
|---|---|---|---|
| `design` | 🎨 | in-task (frontend-gated) | `impeccable` |
| `architecture` | 🏛️ | in-task | `improve-codebase-architecture` |
| `implement` | 🧪 | in-task | `tdd` |
| `coverage` | 📊 | in-task | `tdd` |
| `security` | 🛡️ | in-task | `semgrep` |
| `review` | 🔍 | post-commit | `open-code-review` |
| `thermoNuclear` | ☢️ | post-commit | `thermo-nuclear-code-quality-review` |

`design` only runs on tasks whose line matches the
[frontend heuristic](https://github.com/your-org/lameduck/blob/main/.../roles.ts)
(unless `--force-design`).

---

## File-system side effects

| Path | Lifecycle |
|---|---|
| `specs/<feature>/backlog.md` | `[ ]` → `[x]` flipped on approval |
| `specs/<feature>/reviews/<TXXX>.md` | Overwritten each run (post-commit review body) |
| `specs/<feature>/reports/<TXXX>-report.md` | Overwritten each run (consolidated) |
| `specs/<feature>/reports/lameduck-<ts>.md` | One per run (per-run summary) |
| `.pi/lameduck-tokens.md` | Append-only ledger across runs |

Tasks.md is **never** written by the extension — it is read-only input.

---

## Quality gates

1. **Coverage gate** (in-task) — the `coverage` subagent's final text must
   contain `Coverage: NN.N%` ≥ `--coverage-threshold`.
2. **Post-commit review** — runs after the commit; the output becomes
   `reviews/<TXXX>.md`.
3. **Human consent gate** — TUI select prompt between `✅ Approve` and
   `❌ Reject` (skipped with `--auto-approve`; non-TUI defaults to `reject`
   for safety).

Any failure halts the workflow.

---

## Run modes

### Interactive (default)
```bash
/lameduck 001-llm-perf-analytics
```
Shows pickers, pauses between tasks.

### CI / batch
```bash
/lameduck 001-llm-perf-analytics --auto-approve --no-post-review
```
No TUI prompts; auto-approves; skips review.

### Dry-run
```bash
/lameduck 001-llm-perf-analytics --dry-run
```
Prints the plan (per-task frontend detection, role resolution, branch
plan). **Writes nothing**, spawns no subagents.

---

## Development

```bash
cd .pi/extensions/lameduck
npm install
npm test            # 81 tests
npm run typecheck   # tsc --noEmit
```

The extension auto-loads when `pi` starts in this project (it's under
`.pi/extensions/lameduck/index.ts`). For a one-off test, run
`pi -e ./.pi/extensions/lameduck/index.ts`.

---

## Differences from ai-workflow

| Concern | ai-workflow.ts | lameduck |
|---|---|---|
| Layout | one ~3000-line file | 14 modules under `schema/`, `resolver/`, `subagent/`, … |
| I/O | inline `pi.exec` / `fs` calls | `ExecAdapter` / `FsAdapter` / `UiAdapter` ports |
| State | ad-hoc control flow | explicit 24-phase `state/machine.ts` FSM |
| Resume | none | `resume/index.ts` (handover.md round-trip) |
| Security findings | free-text | `security/contract.ts` parses + scores |
| Tests | none in repo | 81 unit tests across 9 suites |
| `tsc --noEmit` | not checked | clean |
