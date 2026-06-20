/**
 * state/machine.ts — Explicit-phase state machine.
 *
 * The host advances one phase per `tick()`. Each phase receives the
 * current `RunState` and a `Context`, and returns an `Effect` describing
 * what to do next. The machine is pure: it never touches I/O directly.
 *
 * Effects:
 *   - `goto(phase)`  → advance to a new phase
 *   - `halt(reason)` → terminate with a reason
 *   - `done`         → terminal, success
 */

import type { ParsedArgs } from "../schema/args.ts";
import type { RunPhase, RunState, SubagentResult, TaskOutcome, TokenUsage } from "../schema/run-state.ts";
import { IN_TASK_ROLES, POST_ROLES, resolveInTaskRolesForTask, resolvePostRoles, type RoleId } from "../schema/roles.ts";
import type { Task } from "../schema/task.ts";
import { openTasks } from "../resolver/backlog.ts";
import { emptyUsage } from "../subagent/parser.ts";
import { aggregateUsage } from "../subagent/runner.ts";

export type Effect = { kind: "goto"; phase: RunPhase } | { kind: "halt"; reason: string } | { kind: "done" };

export interface PlanEntry {
	task: Task;
	inTaskRoles: RoleId[];
	postRoles: RoleId[];
}

export interface MachineContext {
	feature?: string;
	backlogText?: string;
	backlogPath?: string;
	tasksPath?: string;
	plan: PlanEntry[];
	resolvedSkills: Record<string, string>;
	confirmConsent?: boolean;
	consentChoice?: "approve" | "reject";
	currentOutcome?: TaskOutcome;
	subagentResults?: SubagentResult[];
}

export interface RunInputs {
	args: ParsedArgs;
	cwd: string;
	now: () => Date;
}

export function initRunState(inputs: RunInputs, feature: string): RunState {
	const now = inputs.now().toISOString();
	return {
		version: 1,
		startedAt: now,
		updatedAt: now,
		phase: "init",
		feature,
		args: inputs.args,
		skills: {},
		baseBranch: inputs.args.baseBranch,
		outcomes: [],
		totals: emptyUsage(),
	};
}

export interface TickResult {
	state: RunState;
	ctx: MachineContext;
	effect: Effect;
}

export function tick(state: RunState, ctx: MachineContext): TickResult {
	const next = phaseHandler(state, ctx);
	return {
		state: { ...next.state, updatedAt: new Date().toISOString() },
		ctx: next.ctx,
		effect: next.effect,
	};
}

// ----------------------------------------------------------------------
// Per-phase handlers
// ----------------------------------------------------------------------

interface PhaseOut {
	state: RunState;
	ctx: MachineContext;
	effect: Effect;
}

function phaseHandler(state: RunState, ctx: MachineContext): PhaseOut {
	switch (state.phase) {
		case "init":
			return { state, ctx, effect: { kind: "goto", phase: "resolve-feature" } };
		case "resolve-feature":
			if (!ctx.feature) return { state, ctx, effect: { kind: "halt", reason: "no feature resolved" } };
			return { state: { ...state, feature: ctx.feature }, ctx, effect: { kind: "goto", phase: "ensure-backlog" } };
		case "ensure-backlog":
			if (!ctx.backlogPath) return { state, ctx, effect: { kind: "halt", reason: "no backlog path resolved" } };
			return { state, ctx, effect: { kind: "goto", phase: "parse-backlog" } };
		case "parse-backlog": {
			if (!ctx.plan || ctx.plan.length === 0) {
				return { state, ctx, effect: { kind: "halt", reason: "no tasks planned" } };
			}
			return { state, ctx, effect: { kind: "goto", phase: state.args.dryRun ? "dry-run-plan" : "pick-tasks" } };
		}
		case "pick-tasks":
			return { state, ctx, effect: { kind: "goto", phase: "pick-roles" } };
		case "pick-roles":
			return { state, ctx, effect: { kind: "goto", phase: state.args.dryRun ? "dry-run-plan" : "resolve-skills" } };
		case "resolve-skills":
			return { state, ctx, effect: { kind: "goto", phase: state.args.dryRun ? "dry-run-plan" : "confirm" } };
		case "dry-run-plan":
			return { state, ctx, effect: { kind: "done" } };
		case "confirm":
			if (ctx.confirmConsent === false) return { state, ctx, effect: { kind: "halt", reason: "user cancelled" } };
			return { state, ctx, effect: { kind: "goto", phase: "ensure-git" } };
		case "ensure-git":
			return { state, ctx, effect: { kind: "goto", phase: "branch" } };
		case "branch":
			return { state, ctx, effect: { kind: "goto", phase: "in-task" } };
		case "in-task":
			return { state, ctx, effect: { kind: "goto", phase: "coverage-gate" } };
		case "coverage-gate": {
			const outcome = ctx.currentOutcome;
			if (!outcome) return { state, ctx, effect: { kind: "halt", reason: "no current outcome in coverage-gate" } };
			if (outcome.coverageGate && !outcome.coverageGate.passed) {
				return {
					state: { ...state, haltReason: outcome.coverageGate.reason },
					ctx,
					effect: { kind: "halt", reason: outcome.coverageGate.reason },
				};
			}
			return { state, ctx, effect: { kind: "goto", phase: "commit" } };
		}
		case "commit":
			return { state, ctx, effect: { kind: "goto", phase: "post-commit" } };
		case "post-commit":
			return { state, ctx, effect: { kind: "goto", phase: "write-review" } };
		case "write-review":
			return { state, ctx, effect: { kind: "goto", phase: "consent" } };
		case "consent": {
			const outcome = ctx.currentOutcome;
			if (!outcome) return { state, ctx, effect: { kind: "halt", reason: "no current outcome in consent" } };
			if (ctx.consentChoice === "reject" || outcome.consent === "rejected") {
				return {
					state: { ...state, haltReason: "rejected at consent gate" },
					ctx,
					effect: { kind: "halt", reason: "rejected at consent gate" },
				};
			}
			return { state, ctx, effect: { kind: "goto", phase: "write-report" } };
		}
		case "write-report":
			return { state, ctx, effect: { kind: "goto", phase: "flip-backlog" } };
		case "flip-backlog":
			return { state, ctx, effect: { kind: "goto", phase: "return-to-base" } };
		case "return-to-base":
			return { state, ctx, effect: { kind: "goto", phase: "write-per-run" } };
		case "write-per-run":
			return { state, ctx, effect: { kind: "goto", phase: "ledger" } };
		case "ledger":
			return { state, ctx, effect: { kind: "done" } };
		case "done":
		case "halt":
			return { state, ctx, effect: { kind: "done" } };
		default: {
			// Exhaustiveness guard.
			const _exhaustive: never = state.phase;
			return { state, ctx, effect: { kind: "halt", reason: `unknown phase: ${String(_exhaustive)}` } };
		}
	}
}

// ----------------------------------------------------------------------
// Plan building — pure: parses backlog + applies role resolution per task
// ----------------------------------------------------------------------

export function buildPlan(tasks: Task[], args: ParsedArgs): PlanEntry[] {
	const open = openTasks(tasks);
	const filtered = args.taskIds.length > 0 ? open.filter((t) => args.taskIds.includes(t.id)) : open;
	return filtered.map((task) => ({
		task,
		inTaskRoles: resolveInTaskRolesForTask(task, args),
		postRoles: resolvePostRoles(args),
	}));
}

/** All roles that the plan will spawn — for dry-run summaries. */
export function planRoles(plan: PlanEntry[]): { inTask: Set<RoleId>; post: Set<RoleId> } {
	const inTask = new Set<RoleId>();
	const post = new Set<RoleId>();
	for (const e of plan) {
		for (const r of e.inTaskRoles) inTask.add(r);
		for (const r of e.postRoles) post.add(r);
	}
	return { inTask, post };
}

/** Default in-task set used when args.roles is empty. */
export const DEFAULT_IN_TASK_ROLES = IN_TASK_ROLES;
export const DEFAULT_POST_ROLES = POST_ROLES;

// ----------------------------------------------------------------------
// Totals accumulator
// ----------------------------------------------------------------------

export function addToTotals(into: TokenUsage, from: SubagentResult[]): TokenUsage {
	const agg = aggregateUsage(from);
	return {
		input: into.input + agg.input,
		output: into.output + agg.output,
		cacheRead: into.cacheRead + agg.cacheRead,
		cacheWrite: into.cacheWrite + agg.cacheWrite,
		totalTokens: into.totalTokens + agg.totalTokens,
		cost: into.cost + agg.cost,
	};
}
