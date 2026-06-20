# lameduck

> **A `pi` extension — ai-workflow replacement.**
> Reads `specs/<feature>/backlog.md`, spawns stacked-diff subagents per
> task, enforces a coverage gate, writes per-task reviews + reports,
> pauses for human approval, and flips the backlog on approval.

Single TypeScript file · 13 in-file modules · 82 unit tests · zero
runtime deps beyond `node:*` + `@earendil-works/pi-coding-agent`.

---

## Layout (this directory)

```
lameduck/
├── lameduck.ts          ← the extension (single file, ~1100 lines)
├── lameduck.test.ts     ← 82 unit tests (npx tsx --test lameduck.test.ts)
├── package.json         ← declares `pi.extensions: ["./lameduck.ts"]`
├── tsconfig.json        ← for `tsc --noEmit`
└── README.md            ← this file
```

`pi` auto-loads `lameduck.ts` only — the test file is excluded via
`package.json#pi.extensions`. For a one-off test, run
`pi -e ./lameduck.ts`.

---

## What it does

`/lameduck [<feature>] [T001 …] [flags]` for every open task in
`specs/<feature>/backlog.md`:

1. Creates a **stacked git branch** off the base branch
2. Spawns **in-task subagents** (`architecture`, `implement`, `coverage`,
   `security`, optionally `design` on frontend tasks) — strictly
   sequential, one at a time
3. Enforces an **80% test coverage gate** (configurable)
4. Commits the changes on the stacked branch
5. Spawns the **post-commit review subagents** (`open-code-review` then
   `thermo-nuclear-code-quality-review`)
6. Writes the per-task review and consolidated report
7. **Pauses for you to approve / reject**
8. On approval, flips `[ ]` → `[x]` in `backlog.md` and moves on

---

## In-file module map (13 sections)

`lameduck.ts` is organised into 13 labelled sections so the modular
architecture stays visible inside the single file:

```
§1  Schema         — ParsedArgs, Task, RunState, RoleId + ROLES
§2  Arg parser     — parseArgs() + tokenize() + helpText()
§3  Backlog        — parseBacklogMd() + flipTaskDone() + helpers
§4  Subagent parser — parseSubagentEvents + extractCoveragePct
§5  Subagent runner — piExecSpawn + withRetry + resolvePiBin
§6  Git port       — ExecAdapter + GitOps
§7  Artifacts      — FsAdapter + writeReview/Report/PerRun/ledger
§8  UI port        — UiAdapter + pi/scripted adapters
§9  State machine  — 24-phase FSM + tick() + buildPlan()
§10 Gates          — coverage + consent
§11 Resume         — handover.md round-trip
§12 Security       — report parser/formatter
§13 Entry          — lameduckExtension() + runLameduck()
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
| `--sequential` | — | Accepted for back-compat only; lameduck is always sequential |
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

Seven roles, each bound to a skill shipped under `.pi/skills/<skillDir>`
or `~/.pi/agent/skills/<skillDir>`:

| Role | Emoji | Phase | Skill |
|---|---|---|---|
| `design` | 🎨 | in-task (frontend-gated) | `impeccable` |
| `architecture` | 🏛️ | in-task | `improve-codebase-architecture` |
| `implement` | 🧪 | in-task | `tdd` |
| `coverage` | 📊 | in-task | `tdd` |
| `security` | 🛡️ | in-task | `semgrep` |
| `review` | 🔍 | post-commit | `open-code-review` |
| `thermoNuclear` | ☢️ | post-commit | `thermo-nuclear-code-quality-review` |

`design` only runs on tasks whose line matches the frontend heuristic
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

`tasks.md` is **never** written by the extension — it is read-only input.

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

## Execution model — strictly sequential

**lameduck is single-threaded and synchronous by design.** The whole run
is a single async function with a single for-loop over tasks:

```
for each task in plan (in order):
    1. branch off base              ← git checkout -b
    2. run in-task subagent A       ← spawn pi -p, wait for it
    3. run in-task subagent B       ← spawn pi -p, wait for it
    4. ...
    5. check coverage gate          ← synchronous parse
    6. commit                       ← git add + git commit
    7. run post-commit subagent A   ← spawn pi -p, wait for it
    8. run post-commit subagent B   ← spawn pi -p, wait for it
    9. write review file            ← fs.writeFileSync
   10. consent gate                 ← ctx.ui.select (blocking)
   11. write report file            ← fs.writeFileSync
   12. flip backlog                 ← fs.writeFileSync (only on approval)
   13. checkout base                ← git checkout <base>
```

**Invariants:**

- Tasks run one at a time. There is no `Promise.all` over tasks.
- Within a task, subagents run one at a time (no `Promise.all` over roles).
- Each subagent's spawn is awaited to completion before the next one
  starts — including parsing its `--mode json` stdout for usage.
- Subagent child processes are spawned via `pi.exec`; they are independent
  OS processes but the orchestrator never runs more than one at a time.
- The whole `/lameduck` command is one async call; it returns only after
  the loop finishes (or halts).

If you need to run multiple specs concurrently, run multiple `/lameduck`
invocations in separate `pi` sessions.

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
npm install                # one-time
npm test                   # 82/82 ✓
npm run typecheck          # tsc --noEmit ✓
```

---

## Differences from ai-workflow

| Concern | ai-workflow.ts | lameduck |
|---|---|---|
| Layout | one ~3000-line file | one ~1100-line file, 13 in-file sections |
| I/O | inline `pi.exec` / `fs` calls | `ExecAdapter` / `FsAdapter` / `UiAdapter` ports |
| State | ad-hoc control flow | explicit 24-phase state machine (`tick()`) |
| Resume | none | `RunState` + `handover.md` round-trip |
| Security findings | free-text | `parseSecurityReport` + `scoreSeverity` |
| Tests | none in repo | 88 unit tests, `npx tsx --test` |
| `tsc --noEmit` | not checked | clean |
| Windows / `ENAMETOOLONG` | passes full backlog inline → hits the 32 KB Windows argv limit | truncates the excerpt to 4 KB + writes the full prompt to a temp file and passes it via `--append-system-prompt <path>` |

### Windows-safe subagent spawn

The original ai-workflow passes the full backlog inline as `-p <prompt>`,
which works on Linux/macOS (argv limit ~128 KB+) but blows up on Windows
(`CreateProcess` limit = 32 KB) with `ENAMETOOLONG`.

lameduck fixes this two ways:

1. **`truncateBacklogExcerpt(backlog, 4000)`** — caps the inline excerpt
   at 4 KB and cuts at a line boundary, so the in-prompt body always fits
   comfortably under any OS limit.
2. **`writePromptToTempFile(role, prompt)`** — writes the full prompt to
   `$TMPDIR/lameduck-XXXX/prompt-<role>.md` (mode 0o600) and passes the
   file path via `--append-system-prompt <path>`. Pi reads the file
   contents; the temp file is unlinked in a `finally` block after spawn.

Net effect: the spawned `pi -p` argv is ~250 bytes regardless of backlog
size.
