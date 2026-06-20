/**
 * artifacts/writer.ts — Write per-task reviews / reports / handover.
 *
 * All disk I/O goes through an `FsAdapter` port (ADR-0002):
 *   - NodeFsAdapter — uses node:fs (real disk)
 *   - MemoryFsAdapter — keeps writes in a Map (tests)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { SubagentResult, TaskOutcome } from "../schema/run-state.ts";
import { aggregateUsage } from "../subagent/runner.ts";
import type { Task } from "../schema/task.ts";
import type { RoleId } from "../schema/roles.ts";

export interface FsAdapter {
	read(path: string): string;
	write(path: string, content: string): void;
	mkdirp(path: string): void;
	exists(path: string): boolean;
}

export const nodeFsAdapter: FsAdapter = {
	read(path) {
		return readFileSync(path, "utf8");
	},
	write(path, content) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content, "utf8");
	},
	mkdirp(path) {
		mkdirSync(path, { recursive: true });
	},
	exists(path) {
		return existsSync(path);
	},
};

export function memoryFsAdapter(): FsAdapter & { files: Map<string, string> } {
	const files = new Map<string, string>();
	const adapter: FsAdapter = {
		read(p) {
			const v = files.get(p);
			if (v === undefined) throw new Error(`memoryFs: not found ${p}`);
			return v;
		},
		write(p, c) {
			files.set(p, c);
		},
		mkdirp(_p) {
			/* no-op for memory */
		},
		exists(p) {
			return files.has(p);
		},
	};
	return Object.assign(adapter, { files });
}

// ----------------------------------------------------------------------
// Path helpers
// ----------------------------------------------------------------------

export function reviewPath(feature: string, cwd: string, taskId: string): string {
	return joinPath(cwd, "specs", feature, "reviews", `${taskId}.md`);
}
export function reportPath(feature: string, cwd: string, taskId: string): string {
	return joinPath(cwd, "specs", feature, "reports", `${taskId}-report.md`);
}
export function perRunReportPath(feature: string, cwd: string, ts: Date): string {
	const stamp = formatTimestamp(ts);
	return joinPath(cwd, "specs", feature, "reports", `lameduck-${stamp}.md`);
}
export function handoverPath(cwd: string): string {
	return joinPath(cwd, ".pi", "lameduck-runs", "handover.md");
}
export function ledgerPath(cwd: string): string {
	return joinPath(cwd, ".pi", "lameduck-tokens.md");
}

function joinPath(...parts: string[]): string {
	return parts
		.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
		.filter(Boolean)
		.join("/");
}

function formatTimestamp(d: Date): string {
	const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
		`-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

// ----------------------------------------------------------------------
// Writers
// ----------------------------------------------------------------------

export interface ReviewBody {
	task: Task;
	branch: string;
	reviewResult?: SubagentResult;
	thermoResult?: SubagentResult;
}

export function buildReviewBody(input: ReviewBody): string {
	const { task, branch, reviewResult, thermoResult } = input;
	const sections: string[] = [];
	sections.push(`# ${task.id} — Review`);
	sections.push("");
	sections.push(`- **Task:** ${task.title}`);
	sections.push(`- **Phase:** ${task.phase}`);
	sections.push(`- **Branch:** \`${branch}\``);
	sections.push(`- **State:** ${task.state}`);
	sections.push("");
	if (reviewResult) {
		sections.push(`## Post-commit review (open-code-review)`);
		sections.push("");
		sections.push(reviewResult.finalText || "_(no output)_");
		sections.push("");
	}
	if (thermoResult) {
		sections.push(`## Post-commit thermo-nuclear review`);
		sections.push("");
		sections.push(thermoResult.finalText || "_(no output)_");
		sections.push("");
	}
	return sections.join("\n");
}

export function writeReviewFile(fs: FsAdapter, feature: string, cwd: string, body: ReviewBody): string {
	const p = reviewPath(feature, cwd, body.task.id);
	fs.write(p, buildReviewBody(body));
	return p;
}

export interface ReportBody {
	task: Task;
	branch: string;
	outcome: TaskOutcome;
}

export function buildReportBody(input: ReportBody): string {
	const { task, branch, outcome } = input;
	const total = aggregateUsage(outcome.inTaskResults.concat(outcome.postResults));
	const sections: string[] = [];
	sections.push(`# ${task.id} — Report`);
	sections.push("");
	sections.push(`- **Task:** ${task.title}`);
	sections.push(`- **Phase:** ${task.phase}`);
	sections.push(`- **Branch:** \`${branch}\``);
	sections.push(`- **Created:** ${outcome.branchCreated}`);
	sections.push(`- **Commit:** ${outcome.commit?.hash ?? "_(none)_"}`);
	sections.push(`- **Consent:** ${outcome.consent ?? "pending"}`);
	if (outcome.coverageGate) {
		sections.push(
			`- **Coverage gate:** ${outcome.coverageGate.passed ? "PASS" : "FAIL"} — ${outcome.coverageGate.reason}`,
		);
	}
	sections.push("");
	sections.push(`## Tokens`);
	sections.push("");
	sections.push(`- input: ${total.input}, output: ${total.output}, cost: $${total.cost.toFixed(4)}`);
	sections.push("");
	sections.push(`## In-task subagents`);
	sections.push("");
	for (const r of outcome.inTaskResults) {
		sections.push(`### ${r.role} (exit ${r.exitCode})`);
		sections.push("");
		sections.push(r.finalText || "_(no output)_");
		sections.push("");
	}
	sections.push(`## Post-commit subagents`);
	sections.push("");
	for (const r of outcome.postResults) {
		sections.push(`### ${r.role} (exit ${r.exitCode})`);
		sections.push("");
		sections.push(r.finalText || "_(no output)_");
		sections.push("");
	}
	if (outcome.warnings.length > 0) {
		sections.push(`## Warnings`);
		sections.push("");
		for (const w of outcome.warnings) sections.push(`- ${w}`);
		sections.push("");
	}
	return sections.join("\n");
}

export function writeReportFile(fs: FsAdapter, feature: string, cwd: string, body: ReportBody): string {
	const p = reportPath(feature, cwd, body.task.id);
	fs.write(p, buildReportBody(body));
	return p;
}

export interface PerRunBody {
	feature: string;
	startedAt: string;
	outcomes: TaskOutcome[];
}

export function buildPerRunReport(input: PerRunBody): string {
	const { feature, startedAt, outcomes } = input;
	const total = aggregateUsage(outcomes.flatMap((o) => o.inTaskResults.concat(o.postResults)));
	const sections: string[] = [];
	sections.push(`# lameduck run — ${feature}`);
	sections.push("");
	sections.push(`Started: ${startedAt}`);
	sections.push(`Tasks completed: ${outcomes.filter((o) => o.consent === "approved").length}/${outcomes.length}`);
	sections.push(`Total tokens: in ${total.input}, out ${total.output}, cost $${total.cost.toFixed(4)}`);
	sections.push("");
	sections.push(`## Tasks`);
	sections.push("");
	for (const o of outcomes) {
		sections.push(`- **${o.task.id}** ${o.task.title} — consent=${o.consent ?? "pending"}`);
	}
	return sections.join("\n");
}

export function writePerRunReport(fs: FsAdapter, feature: string, cwd: string, body: PerRunBody): string {
	const p = perRunReportPath(feature, cwd, new Date(body.startedAt));
	fs.write(p, buildPerRunReport(body));
	return p;
}

export interface LedgerSection {
	feature: string;
	startedAt: string;
	roles: RoleId[];
	tokens: { input: number; output: number; cost: number };
}

export function appendLedgerSection(fs: FsAdapter, cwd: string, section: LedgerSection): string {
	const p = ledgerPath(cwd);
	const existing = fs.exists(p) ? fs.read(p) : "# lameduck token ledger\n\n";
	const block = [
		`## ${section.feature} — ${section.startedAt}`,
		``,
		`Roles: ${section.roles.join(", ")}`,
		`Tokens: in ${section.tokens.input}, out ${section.tokens.output}, cost $${section.tokens.cost.toFixed(4)}`,
		``,
	].join("\n");
	fs.write(p, existing + block);
	return p;
}
