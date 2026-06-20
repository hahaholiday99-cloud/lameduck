/**
 * schema/run-state.ts — RunState and RunPhase.
 *
 * A `RunState` is the whole serialisable picture of one lameduck run:
 * the args, the per-task results, the resolved roles, the gates, and
 * the current phase. The state machine advances the phase one tick at
 * a time so we can persist + resume mid-run.
 */

import type { ParsedArgs } from "./args.ts";
import type { Task } from "./task.ts";
import type { RoleId } from "./roles.ts";

export type RunPhase =
	| "init"
	| "resolve-feature"
	| "ensure-backlog"
	| "parse-backlog"
	| "pick-tasks"
	| "pick-roles"
	| "resolve-skills"
	| "dry-run-plan"
	| "confirm"
	| "ensure-git"
	| "branch"
	| "in-task"
	| "coverage-gate"
	| "commit"
	| "post-commit"
	| "write-review"
	| "consent"
	| "write-report"
	| "flip-backlog"
	| "return-to-base"
	| "write-per-run"
	| "ledger"
	| "done"
	| "halt";

export const RUN_PHASES: RunPhase[] = [
	"init",
	"resolve-feature",
	"ensure-backlog",
	"parse-backlog",
	"pick-tasks",
	"pick-roles",
	"resolve-skills",
	"dry-run-plan",
	"confirm",
	"ensure-git",
	"branch",
	"in-task",
	"coverage-gate",
	"commit",
	"post-commit",
	"write-review",
	"consent",
	"write-report",
	"flip-backlog",
	"return-to-base",
	"write-per-run",
	"ledger",
	"done",
	"halt",
];

export interface TokenUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
}

export interface SubagentResult {
	role: RoleId;
	taskId: string;
	ok: boolean;
	exitCode: number;
	durationMs: number;
	finalText: string;
	stdout: string;
	stderr: string;
	killed: boolean;
	usage: TokenUsage;
	model?: string;
}

export interface GateVerdict {
	passed: boolean;
	reason: string;
	coveragePct?: number;
	threshold?: number;
}

export interface TaskOutcome {
	task: Task;
	branch: string;
	branchCreated: boolean;
	inTaskRoles: RoleId[];
	inTaskResults: SubagentResult[];
	coverageGate?: GateVerdict;
	commit?: { hash?: string; message: string; warnings: string[] };
	postRoles: RoleId[];
	postResults: SubagentResult[];
	reviewPath: string;
	reportPath: string;
	consent?: "approved" | "rejected" | "skipped";
	warnings: string[];
}

export interface RunState {
	version: 1;
	startedAt: string; // ISO timestamp
	updatedAt: string;
	phase: RunPhase;
	feature: string;
	args: ParsedArgs;
	skills: Record<string, string>; // role -> resolved skill path
	baseBranch: string;
	outcomes: TaskOutcome[];
	haltReason?: string;
	totals: TokenUsage;
}
