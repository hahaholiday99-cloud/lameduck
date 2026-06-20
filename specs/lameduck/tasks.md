# lameduck — Tasks (backlog source)

> Source of truth: [`docs/designs/lameduck-design.md`](../../docs/designs/lameduck-design.md) §12.
> Run with: `/ai-workflow lameduck` (uses the existing orchestration) OR follow the lameduck pattern when it exists.

## Phase 0 — Design (done)

- [ ] T000  Approve design at `docs/designs/lameduck-design.md` (xiao ming)
- [ ] T000a Persist design to `docs/designs/lameduck-design.md`
- [ ] T000b Create spec skeleton: `specs/lameduck/{spec,tasks,backlog}.md`

## Phase 1 — Foundations (parallel-safe)

- [ ] T001  Architecture review of the design (sub-agent: architecture, skill: improve-codebase-architecture)
       Output: concerns sealed + ADRs at `docs/adr/0001-lameduck-*.md`
       **Status:** done — 4 ADRs written and **accepted**, 5 candidates surfaced, top rec: collapse resolver
       Review file: `specs/lameduck/reviews/T001-architecture.md`
       HTML report: `/tmp/architecture-review-lameduck-2026-06-15.html`
       ADRs: `docs/adr/0001-...` through `0004-...` (all accepted 2026-06-15)
- [ ] T002  Schema layer (`schema/args.ts`, `schema/roles.ts`, `schema/run-state.ts`, `schema/task.ts`)
       Sub-agent: implement / Skill: tdd / Output: Zod-validated schemas + unit tests
       **Status:** done — 4 schema files, 4 test files, 29/29 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/schema/{args,roles,run-state,task}.ts`
       Tests: `.pi/extensions/lameduck/tests/schema/{args,roles,run-state,task}.test.ts`
       Run: `cd .pi/extensions/lameduck && npx tsx --test tests/schema/*.test.ts`
       Review file: `specs/lameduck/reviews/T002-schema.md`
- [ ] T003  Subagent runner (`subagent/runner.ts`) — withRetry (inlined per ADR-0004) + parseSubagentOutput + spawnSubagent
       Sub-agent: implement / Skill: tdd / Output: SpawnFn port + retry + LLM-event-stream parser
       **Status:** done — 17/17 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/subagent/runner.ts`
       Tests: `.pi/extensions/lameduck/tests/subagent/runner.test.ts`
- [ ] T004  Git ops (`git/index.ts`) — ExecAdapter port per ADR-0003 (ShellExecAdapter + RecordingExecAdapter)
       Sub-agent: implement / Skill: tdd / Output: GitOps with 6 methods + port + 2 adapters
       **Status:** done — 20/20 tests green (incl. 2 real-git integration tests), `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/git/index.ts`
       Tests: `.pi/extensions/lameduck/tests/git/index.test.ts`
- [ ] T005  Backlog parser (`resolver/backlog.ts`) — pure markdown → Task[] parser
       Sub-agent: implement / Skill: tdd / Output: regex parser supporting phases / flags / done states
       **Status:** done — 18/18 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/resolver/backlog.ts`
       Tests: `.pi/extensions/lameduck/tests/resolver/backlog.test.ts`
- [ ] T007  Artifact writer (`artifacts/writer.ts`) — FsAdapter port per ADR-0002 (NodeFsAdapter + MemoryFsAdapter)
       Sub-agent: implement / Skill: tdd / Output: writeReview / writeTaskReport / writeHandover / ensureSpecDirs
       **Status:** done — 15/15 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/artifacts/writer.ts`
       Tests: `.pi/extensions/lameduck/tests/artifacts/writer.test.ts`
- [ ] T008  UI prompts (`ui/prompt.ts`) — UiAdapter port (ScriptedUiAdapter + PiUiAdapter)
       Sub-agent: implement / Skill: tdd / Output: selectFeature / selectTasks / consent + 2 adapters
       **Status:** done — 19/19 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/ui/prompt.ts`
       Tests: `.pi/extensions/lameduck/tests/ui/prompt.test.ts`
- [ ] T003–T008  Phase 1 sweep review file
       Output: cumulative review at `specs/lameduck/reviews/T003-T008-phase1.md`
       Status: **118/118 tests green, `tsc --noEmit` clean**
- [ ] T006  State machine (`state/machine.ts`) — 21-phase explicit state machine with `run()` / `tick()` / phase handlers
       Sub-agent: implement / Skill: tdd / Output: integrate T002–T005 + T007 + T008 into a single tickable loop
       **Status:** done — 13/13 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/state/machine.ts`
       Tests: `.pi/extensions/lameduck/tests/state/machine.test.ts`
- [ ] T009  Resume / handover (`resume/index.ts`) — handover.md read/write + HandoverSnapshot ↔ RunState
       Sub-agent: implement / Skill: tdd / Output: loadHandover / handoverFromState / runStateFromHandover / writeHandoverFile
       **Status:** done — 9/9 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/resume/index.ts`
       Tests: `.pi/extensions/lameduck/tests/resume/index.test.ts`
- [ ] T010  Gates (`state/gates.ts`) — coverage gate + consent gate
       Sub-agent: implement / Skill: tdd / Output: checkCoverageGate / checkConsentGate + GateResult
       **Status:** done — 10/10 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/state/gates.ts`
       Tests: `.pi/extensions/lameduck/tests/state/gates.test.ts`
- [ ] T011  Security contract (`security/contract.ts`) — markdown report parser/formatter for security findings
       Sub-agent: implement / Skill: tdd / Output: parseSecurityReport / formatSecurityReport / scoreSeverity
       **Status:** done — 12/12 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/security/contract.ts`
       Tests: `.pi/extensions/lameduck/tests/security/contract.test.ts`
- [ ] T006–T011  Phase 2 sweep review file
       Output: cumulative review at `specs/lameduck/reviews/T006-T011-phase2.md`
       Status: **162/162 tests green, `tsc --noEmit` clean**
- [ ] T012  End-to-end `--dry-run` smoke test
       Sub-agent: implement / Skill: tdd / Output: a dry-run on `specs/001-llm-perf-analytics/backlog.md` that resolves + prints the plan, no subagents spawned
       **Status:** done — 3/3 tests green, `tsc --noEmit` clean
       Files: `.pi/extensions/lameduck/tests/t012-dry-run.test.ts`
- [ ] T013  Coverage verification on a fixture spec
       Sub-agent: coverage / Skill: tdd / Output: ≥80% on lameduck core
       **Status:** done — 100.00% line / 100.00% branch / 100.00% function coverage (run via `npm run test:t013`)
       Files: `.pi/extensions/lameduck/tests/t013-coverage.test.ts`, `npm run test:coverage`
- [ ] T014  Wire up the entry (`lameduck.ts` registers `/lameduck` command)
       Sub-agent: implement / Skill: tdd / Output: command registration + arg parsing + main dispatch
       **Status:** done — 17/17 tests green, `tsc --noEmit` clean; verified loads via `load-lameduck.mjs`
       Files: `.pi/extensions/lameduck/lameduck.ts`, `tests/lameduck.test.ts`
- [ ] T012–T014  Phase 3 sweep review file
       Output: cumulative review at `specs/lameduck/reviews/T012-T014-phase3.md`
       Status: **runnable `/lameduck` command** — end-to-end dry-run completes a real spec, default-adapter suite passes, 100% test coverage
- [ ] T015  Code-quality pass (`open-code-review` skill)
       Sub-agent: open-code-review / Skill: open-code-review / Output: review findings on the full lameduck module set
       **Status:** done — 89 findings triaged; 14 high + 4 medium fixes landed in `.pi/extensions/lameduck/`
       Files: `specs/lameduck/reviews/T015-T016-phase4-review.md`, `specs/lameduck/ocr-rules.json`
- [ ] T016  Thermo-nuclear pass (`thermo-nuclear-code-quality-review` skill)
       Sub-agent: thermo-nuclear / Skill: thermo-nuclear-code-quality-review / Output: structural code-judo opportunities
       **Status:** done — 2 structural findings landed (T1: flipTaskDone throw + regex tightening; T3: git.addAll; T5: spawnForRole helper; T6: post-commit verdict check)
- [ ] T017  README for `lameduck`
       Sub-agent: design / Skill: impeccable / Output: end-user-facing README documenting install, use, architecture, and design decisions
       **Status:** done — `specs/lameduck/README.md` (12 KB) covers architecture diagram, 21-phase FSM diagram, all 16 flags, module table, design decisions, test commands
       Files: `.pi/extensions/lameduck/README.md`
- [ ] T015–T017  Phase 4 sweep review file
       Output: cumulative review at `specs/lameduck/reviews/T015-T016-phase4-review.md`
       Status: **193/193 tests green, tsc clean, 100% coverage; every OCR-high + thermo-nuclear finding either fixed or explicitly deferred to backlog**
- [ ] T003  Subagent runner (`subagent/runner.ts` with inlined retry per ADR-0004, `subagent/parser.ts`)
       Sub-agent: implement / Skill: tdd / Output: spawn + parse + retry with mock-pi tests
- [ ] T004  Git ops (`git/index.ts` per ADR-0003 — one module with ExecAdapter port: ShellExecAdapter + RecordingExecAdapter)
       Sub-agent: implement / Skill: tdd / Output: branch + commit + return with recording-exec tests
- [ ] T005  Backlog ops (`backlog.ts` per ADR-0001 c4 — one module with parse, format, flipCheckbox, ensureBacklog)
       Sub-agent: implement / Skill: tdd / Output: parse + flip + seed with golden-file tests
- [ ] T006  State machine + phase functions (`pipeline/state-machine.ts`, `pipeline/phases.ts`, `pipeline/parallel.ts`)
       Sub-agent: implement / Skill: tdd / Output: 13-phase machine + transition tests
       **Depends on:** T002 (uses RunState), T003 (uses SubagentRunner), T004 (uses git ops)
- [ ] T007  Artifact writer (`artifacts/writer.ts` per ADR-0002 — one module with FsAdapter port: NodeFsAdapter + MemoryFsAdapter)
       Sub-agent: implement / Skill: tdd / Output: kind-discriminated write/read + memory-adapter tests
- [ ] T008  RPC-safe UI prompts (`ui/prompts.ts`, `ui/notify.ts`)
       Sub-agent: implement / Skill: tdd / Output: mode-guarded pickers + bounded notifications

## Phase 2 — Resume + gates

- [ ] T009  Resume support (`--resume` flag + state persistence to `.pi/lameduck-runs/`)
       Sub-agent: implement / Skill: tdd / Output: state file + restore + branch-drift validation
       **Depends on:** T002, T006
- [ ] T010  Quality gates (`pipeline/gates.ts`: coverage gate, human consent gate)
       Sub-agent: implement / Skill: tdd / Output: gate functions with halt behaviour
       **Depends on:** T006
- [ ] T011  Security review of subprocess spawn, file ops, ledger writes
       Sub-agent: security / Skill: code-security + semgrep
       **Depends on:** T003, T004, T007

## Phase 3 — Integration

- [ ] T012  End-to-end `--dry-run` smoke test
       Sub-agent: implement / Skill: tdd / Output: a dry-run on `specs/001-llm-perf-analytics/backlog.md` that resolves + prints the plan, no subagents spawned
       **Depends on:** T002, T006, T007
- [ ] T013  Coverage verification on a fixture spec
       Sub-agent: coverage / Skill: tdd / Output: ≥80% on lameduck core
       **Depends on:** T002–T010
- [ ] T014  Wire up the entry (`lameduck.ts` registers `/lameduck` command)
       Sub-agent: implement / Skill: tdd / Output: command registration + arg parsing + main dispatch
       **Depends on:** T002, T006, T007, T008, T009, T010

## Phase 4 — Review

- [ ] T015  Post-commit review (open-code-review pass on the lameduck diff)
       Sub-agent: review / Skill: open-code-review
       **Depends on:** T002–T014
- [ ] T016  Maintainability pass (file-size discipline, code-judo, spaghetti avoidance)
       Sub-agent: thermoNuclear / Skill: thermo-nuclear-code-quality-review
       **Depends on:** T002–T014
- [ ] T017  Documentation (`.pi/extensions/lameduck/README.md`)
       Sub-agent: implement / Skill: tdd
       **Depends on:** T014

## Phase 5 — First real run

- [ ] T018  Worked example: run `/lameduck 001-llm-perf-analytics` on task T001 end-to-end
       Sub-agent: implement / Skill: tdd
       **Depends on:** T002–T017
       **Output:** first per-task review + report + handover
       **Status:** done — 5 dogfood tests in `tests/t018-dogfood.test.ts`. Fixed a real bug along the way (dry-run was mutating the backlog file). Plus a hermetic-dry-run regression test in `tests/state/machine.test.ts`.
       Files: `tests/t018-dogfood.test.ts`, `specs/lameduck/reviews/T018-worked-example.md`
- [ ] T015–T018  Phase 5 sweep review file
       Output: cumulative review at `specs/lameduck/reviews/T018-worked-example.md`
       Status: **194/194 tests green, tsc clean, 100% coverage; lameduck is feature-complete and ready for production use**

---

## Notes for the orchestrator

- **Parallelism:** T002–T008 are independent (different files). T006 depends on T002/T003/T004.
- **Gating:** T011 (security) and T013 (coverage) gate progress to Phase 3.
- **Coverage gate:** 80% threshold (matches lameduck's own default).
- **Stacked branches:** `feat/lameduck/TXXX` off `main`.
- **Read-only inputs to subagents:** this `spec.md`, `tasks.md`, and the design doc.
