/**
 * lameduck — entry point.
 *
 * Registers the `/lameduck` slash command. Wires together the schema,
 * resolver, subagent runner, git ops, artifact writer, UI prompts,
 * gates, and state machine into a single tickable pipeline.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir as nodeHomedir } from "node:os";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { parseArgs, helpText } from "./schema/args.ts";
import type { ParsedArgs } from "./schema/args.ts";
import type { RoleId } from "./schema/roles.ts";
import { ROLES, isFrontendTask } from "./schema/roles.ts";
import type { RunState, SubagentResult, TaskOutcome, TokenUsage } from "./schema/run-state.ts";
import { emptyUsage } from "./subagent/parser.ts";
import {
	buildSubagentPrompt,
	piExecSpawn,
	resolvePiBin,
	withRetry,
	aggregateUsage,
} from "./subagent/runner.ts";

import {
	backlogFilePath,
	buildBacklogFromTasks,
	filterByIds,
	flipTaskDone,
	parseBacklogMd,
} from "./resolver/backlog.ts";
import { GitOps, piExecAdapter } from "./git/index.ts";
import {
	buildPerRunReport,
	ledgerPath,
	memoryFsAdapter,
	nodeFsAdapter,
	reportPath,
	reviewPath,
	writePerRunReport,
	writeReportFile,
	writeReviewFile,
	appendLedgerSection,
} from "./artifacts/writer.ts";
import { piUiAdapter } from "./ui/prompt.ts";
import type { UiAdapter } from "./ui/prompt.ts";
import { checkConsentGate, checkCoverageGate } from "./state/gates.ts";
import {
	addToTotals,
	buildPlan,
	initRunState,
	planRoles,
	tick,
	type MachineContext,
	type PlanEntry,
} from "./state/machine.ts";

const DEFAULT_BRANCH_PREFIX = (feature: string): string => `feat/${feature}/`;

export default function lameduckExtension(pi: ExtensionAPI): void {
	pi.registerCommand("lameduck", {
		description: "Modular ai-workflow replacement. Spawns stacked-diff subagents per task.",
		handler: async (rawArgs, ctx) => {
			await runLameduck(pi, ctx, rawArgs);
		},
	});
}

export async function runLameduck(pi: ExtensionAPI, ctx: ExtensionCommandContext, rawArgs: string): Promise<void> {
	const args = parseArgs(rawArgs);
	if (args.help) {
		ctx.ui.notify(helpText(), "info");
		return;
	}

	const ui = piUiAdapter(ctx);
	const cwd = ctx.cwd;
	const fs = nodeFsAdapter;

	// ----- Phase: resolve-feature -----------------------------------
	const feature = await resolveFeature(args, ui, cwd);
	if (!feature) {
		ui.notify("lameduck: no feature selected", "warning");
		return;
	}

	// ----- Phase: ensure-backlog + parse-backlog --------------------
	const backlogPath = args.path ?? backlogFilePath(feature, cwd);
	const backlogText = ensureBacklogText(backlogPath, feature, cwd, fs);
	const tasks = parseBacklogMd(backlogText);
	if (args.taskIds.length > 0) {
		// Throws on unknown id.
		filterByIds(tasks, args.taskIds);
	}

	const state = initRunState({ args, cwd, now: () => new Date() }, feature);
	const plan = buildPlan(tasks, args);
	if (plan.length === 0) {
		ui.notify("lameduck: no open tasks in backlog", "warning");
		return;
	}
	args.branchPrefix = args.branchPrefix || DEFAULT_BRANCH_PREFIX(feature);

	// ----- Phase: dry-run -------------------------------------------
	if (args.dryRun) {
		printDryRun(plan, args, feature, cwd, ui);
		return;
	}

	// ----- Phase: confirm -------------------------------------------
	if (ui.hasUI() && !args.autoApprove) {
		const ok = await ui.confirm(
			`Run lameduck on ${feature}?`,
			`Tasks: ${plan.length}. Roles: ${args.roles?.join(",") ?? "all in-task"}. Branch prefix: ${args.branchPrefix}`,
		);
		if (!ok) {
			ui.notify("lameduck: cancelled", "warning");
			return;
		}
	}

	// ----- Phase: ensure-git ----------------------------------------
	const git = new GitOps({ cwd, exec: piExecAdapter(pi) });
	await git.init(args.baseBranch);

	// ----- Phase: resolve-skills ------------------------------------
	const skills = resolveSkills(plan, cwd);
	const missing = Object.entries(skills).filter(([, v]) => v === "");
	if (missing.length > 0) {
		ui.notify(`lameduck: missing skills: ${missing.map((m) => m[0]).join(", ")}`, "error");
		return;
	}

	const exe = resolvePiBin(cwd);
	const totals: TokenUsage = { ...emptyUsage() };
	const allOutcomes: TaskOutcome[] = [];

	// ----- Per-task loop --------------------------------------------
	for (let i = 0; i < plan.length; i++) {
		const entry = plan[i];
		if (!entry) continue;
		ui.notify(`▶ ${entry.task.id} ${entry.task.title}`, "info");
		ui.setStatus("lameduck", `${entry.task.id} (${i + 1}/${plan.length})`);

		const branch = `${args.branchPrefix}${entry.task.id}`;
		await git.createOrCheckoutBranch(branch, args.baseBranch);

		// In-task subagents
		const inTaskResults = await runInTaskRoles({
			entry,
			feature,
			args,
			cwd,
			backlogText,
			skills,
			pi,
			exe,
			ui,
		});

		// Coverage gate
		const coverageResult = inTaskResults.find((r) => r.role === "coverage");
		const coverageVerdict = checkCoverageGate({
			coverageRan: !!coverageResult,
			finalText: coverageResult?.finalText ?? "",
			threshold: args.coverageThreshold,
		});

		// Commit
		const titlePart = entry.task.title.length > 72 ? entry.task.title.slice(0, 69) + "…" : entry.task.title;
		const commitMessage = [
			`${entry.task.id}: ${titlePart}`,
			``,
			`Task: ${entry.task.title}`,
			`Feature: ${feature}`,
			`Branch: ${branch}`,
			``,
			`Generated by lameduck.`,
		].join("\n");
		const commitInfo = await git.commitAll(commitMessage);

		// Post-commit subagents
		const postResults = await runPostRoles({
			entry,
			feature,
			args,
			cwd,
			backlogText,
			skills,
			pi,
			exe,
			ui,
		});

		// Write review file (post-commit review only — thermo-nuclear goes in report).
		const reviewBody = {
			task: entry.task,
			branch,
			reviewResult: postResults.find((r) => r.role === "review"),
			thermoResult: postResults.find((r) => r.role === "thermoNuclear"),
		};
		const reviewFile = writeReviewFile(fs, feature, cwd, reviewBody);

		// Consent gate
		let consent: TaskOutcome["consent"];
		if (args.autoApprove) {
			consent = "approved";
		} else if (!ui.hasUI()) {
			consent = "skipped";
			ui.notify(`lameduck: non-UI mode, defaulting consent=skipped for ${entry.task.id}`, "warning");
		} else {
			const choice = await ui.select(
				`Approve ${entry.task.id}?`,
				["✅ Approve", "❌ Reject"],
			);
			consent = choice === "✅ Approve" ? "approved" : "rejected";
		}

		const outcome: TaskOutcome = {
			task: entry.task,
			branch,
			branchCreated: false, // We didn't track creation here; safe default.
			inTaskRoles: entry.inTaskRoles,
			inTaskResults,
			coverageGate: coverageVerdict,
			commit: { hash: commitInfo.hash, message: commitMessage, warnings: commitInfo.warnings },
			postRoles: entry.postRoles,
			postResults,
			reviewPath: reviewFile,
			reportPath: "", // filled below
			consent,
			warnings: commitInfo.warnings,
		};
		allOutcomes.push(outcome);

		// Write consolidated report
		const reportFile = writeReportFile(fs, feature, cwd, {
			task: entry.task,
			branch,
			outcome,
		});
		outcome.reportPath = reportFile;

		// Flip backlog if approved
		if (consent === "approved") {
			const flipped = flipTaskDone(backlogText, entry.task.id);
			if (flipped) {
				fs.write(backlogPath, flipped.content);
			}
		}

		// Roll up totals
		const agg = aggregateUsage(inTaskResults.concat(postResults));
		totals.input += agg.input;
		totals.output += agg.output;
		totals.cacheRead += agg.cacheRead;
		totals.cacheWrite += agg.cacheWrite;
		totals.totalTokens += agg.totalTokens;
		totals.cost += agg.cost;

		// Halt on coverage failure or rejection
		if (coverageVerdict && !coverageVerdict.passed) {
			ui.notify(`lameduck: coverage gate failed — ${coverageVerdict.reason}`, "error");
			break;
		}
		if (consent === "rejected") {
			ui.notify(`lameduck: ${entry.task.id} rejected at consent gate`, "warning");
			break;
		}

		// Return to base branch for next task
		await git.checkout(args.baseBranch);
	}

	// ----- Per-run report + ledger ---------------------------------
	const perRunFile = writePerRunReport(fs, feature, cwd, {
		feature,
		startedAt: state.startedAt,
		outcomes: allOutcomes,
	});
	const ledgerFile = appendLedgerSection(fs, cwd, {
		feature,
		startedAt: state.startedAt,
		roles: Array.from(new Set(plan.flatMap((p) => p.inTaskRoles.concat(p.postRoles)))),
		tokens: { input: totals.input, output: totals.output, cost: totals.cost },
	});

	ui.setStatus("lameduck", "");
	ui.notify(
		`lameduck: ${allOutcomes.filter((o) => o.consent === "approved").length}/${allOutcomes.length} approved · per-run ${perRunFile} · ledger ${ledgerFile}`,
		"info",
	);

	// Sanity: ensure the machine's tick semantics don't bite us later.
	void tick;
	void addToTotals;
}

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

async function resolveFeature(args: ParsedArgs, ui: UiAdapter, cwd: string): Promise<string | undefined> {
	if (args.feature) return args.feature;
	if (!ui.hasUI()) {
		ui.notify("lameduck: feature required (non-UI mode)", "error");
		return undefined;
	}
	const features = listFeatureDirs(cwd);
	if (features.length === 0) {
		ui.notify("lameduck: no specs/ directories found", "error");
		return undefined;
	}
	return ui.select("Select feature:", features);
}

function listFeatureDirs(cwd: string): string[] {
	const specs = join(cwd, "specs");
	if (!existsSync(specs)) return [];
	let entries: string[];
	try {
		entries = readdirSync(specs);
	} catch {
		return [];
	}
	return entries.filter((e) => {
		try {
			return statSync(join(specs, e)).isDirectory();
		} catch {
			return false;
		}
	});
}

function ensureBacklogText(backlogPath: string, feature: string, cwd: string, fs: ReturnType<typeof memoryFsAdapter> | typeof nodeFsAdapter): string {
	if (fs.exists(backlogPath)) return fs.read(backlogPath);
	// Try seeding from tasks.md
	const tasksPath = join(cwd, "specs", feature, "tasks.md");
	if (fs.exists(tasksPath)) {
		const text = buildBacklogFromTasks(fs.read(tasksPath), feature);
		fs.write(backlogPath, text);
		return text;
	}
	throw new Error(`lameduck: neither ${backlogPath} nor ${tasksPath} exist`);
}

function resolveSkills(plan: PlanEntry[], cwd: string): Record<string, string> {
	const out: Record<string, string> = {};
	const wanted = new Set<string>();
	for (const entry of plan) {
		for (const role of entry.inTaskRoles.concat(entry.postRoles)) wanted.add(role);
	}
	for (const role of wanted) {
		const def = ROLES[role as RoleId];
		if (!def) continue;
		out[role] = locateSkill(def.skillDir, cwd) ?? "";
	}
	return out;
}

function locateSkill(skillDir: string, cwd: string): string | undefined {
	const home = nodeHomedir();
	const candidates = [
		join(cwd, ".pi", "skills", skillDir, "SKILL.md"),
		join(cwd, ".pi", "skills", skillDir),
		join(home, ".pi", "agent", "skills", skillDir, "SKILL.md"),
		join(home, ".pi", "agent", "skills", skillDir),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return undefined;
}

function printDryRun(plan: PlanEntry[], args: ParsedArgs, feature: string, cwd: string, ui: UiAdapter): void {
	const lines: string[] = [];
	lines.push(`# lameduck dry-run — ${feature}`);
	lines.push("");
	lines.push(`Tasks: ${plan.length}, branch prefix: ${args.branchPrefix || DEFAULT_BRANCH_PREFIX(feature)}, base: ${args.baseBranch}`);
	const { inTask, post } = planRoles(plan);
	lines.push(`In-task roles: ${Array.from(inTask).join(", ") || "(none)"}`);
	lines.push(`Post-commit roles: ${Array.from(post).join(", ") || "(none)"}`);
	lines.push("");
	for (const entry of plan) {
		const frontend = isFrontendTask({ title: entry.task.title, raw: entry.task.raw });
		lines.push(`- ${entry.task.id} [${frontend ? "frontend" : "backend"}] ${entry.task.title} → ${entry.inTaskRoles.join(",") || "(no in-task roles)"}`);
	}
	ui.notify(lines.join("\n"), "info");
	void cwd;
}

async function runInTaskRoles(args: {
	entry: PlanEntry;
	feature: string;
	args: ParsedArgs;
	cwd: string;
	backlogText: string;
	skills: Record<string, string>;
	pi: ExtensionAPI;
	exe: { command: string; prefixArgs: string[] };
	ui: UiAdapter;
}): Promise<SubagentResult[]> {
	const { entry, feature, args: cli, cwd, backlogText, skills, pi, exe, ui } = args;
	const roles = entry.inTaskRoles;
	if (roles.length === 0) return [];

	const runOne = async (role: RoleId): Promise<SubagentResult> => {
		const skillPath = skills[role];
		if (!skillPath) {
			return {
				role,
				taskId: entry.task.id,
				ok: false,
				exitCode: 127,
				durationMs: 0,
				finalText: "",
				stdout: "",
				stderr: `skill for role "${role}" not resolved`,
				killed: false,
				usage: { ...emptyUsage() },
			};
		}
		const prompt = buildSubagentPrompt({
			role,
			task: entry.task,
			feature,
			backlog: backlogText,
			coverageThreshold: cli.coverageThreshold,
		});
		const r = await withRetry(piExecSpawn, pi, cwd, exe, {
			role,
			task: entry.task,
			feature,
			backlogText,
			skillPath,
			prompt,
			model: cli.model,
			thinking: cli.thinking,
			signal: undefined,
		});
		ui.notify(`${entry.task.id} · ${role} → exit ${r.exitCode} (${r.usage.input}↑/${r.usage.output}↓)`, "info");
		return r;
	};

	if (cli.parallelism === "parallel") {
		return Promise.all(roles.map(runOne));
	}
	const out: SubagentResult[] = [];
	for (const role of roles) out.push(await runOne(role));
	return out;
}

async function runPostRoles(args: {
	entry: PlanEntry;
	feature: string;
	args: ParsedArgs;
	cwd: string;
	backlogText: string;
	skills: Record<string, string>;
	pi: ExtensionAPI;
	exe: { command: string; prefixArgs: string[] };
	ui: UiAdapter;
}): Promise<SubagentResult[]> {
	const { entry, feature, args: cli, cwd, backlogText, skills, pi, exe, ui } = args;
	const roles = entry.postRoles;
	if (roles.length === 0) return [];
	const out: SubagentResult[] = [];
	for (const role of roles) {
		const skillPath = skills[role];
		if (!skillPath) {
			out.push({
				role,
				taskId: entry.task.id,
				ok: false,
				exitCode: 127,
				durationMs: 0,
				finalText: "",
				stdout: "",
				stderr: `skill for role "${role}" not resolved`,
				killed: false,
				usage: { ...emptyUsage() },
			});
			continue;
		}
		const prompt = buildSubagentPrompt({ role, task: entry.task, feature, backlog: backlogText });
		const r = await withRetry(piExecSpawn, pi, cwd, exe, {
			role,
			task: entry.task,
			feature,
			backlogText,
			skillPath,
			prompt,
			model: cli.model,
			thinking: cli.thinking,
			signal: undefined,
		});
		ui.notify(`${entry.task.id} · ${role} → exit ${r.exitCode}`, "info");
		out.push(r);
	}
	return out;
}

// Internal helpers exported for unit tests.
export const __test = {
	resolveSkills,
	listFeatureDirs,
	locateSkill,
	printDryRun,
};
