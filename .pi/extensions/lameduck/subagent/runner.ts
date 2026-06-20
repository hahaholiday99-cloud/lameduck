/**
 * subagent/runner.ts — Spawn a subagent `pi -p --mode json --skill <path>`.
 *
 * The host (this extension) is the orchestrator; the subagent does the
 * domain work. We pass `--mode json` so the child's stdout is a stream
 * of JSON events that we parse for usage accounting.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir as nodeHomedir } from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RoleId } from "../schema/roles.ts";
import type { Task } from "../schema/task.ts";
import type { SubagentResult, TokenUsage } from "../schema/run-state.ts";
import { emptyUsage, parseSubagentEvents } from "./parser.ts";

export interface SpawnOptions {
	role: RoleId;
	task: Task;
	feature: string;
	backlogText: string;
	skillPath: string;
	prompt: string;
	model?: string;
	thinking?: string;
	timeoutMs?: number;
	signal?: AbortSignal;
}

export interface SpawnFn {
	(
		pi: ExtensionAPI,
		cwd: string,
		exe: { command: string; prefixArgs: string[] },
		opts: SpawnOptions,
	): Promise<SubagentResult>;
}

/** Default subagent-spawn implementation: uses `pi.exec` (cross-platform). */
export const piExecSpawn: SpawnFn = async (pi, cwd, exe, opts) => {
	const args: string[] = [
		...exe.prefixArgs,
		"-p",
		opts.prompt,
		"--no-session",
		"--no-extensions",
		"--mode",
		"json",
		"--skill",
		opts.skillPath,
	];
	if (opts.model) args.push("--model", opts.model);
	if (opts.thinking) args.push("--thinking", opts.thinking);

	const started = Date.now();
	const res = await pi.exec(exe.command, args, {
		cwd,
		timeout: opts.timeoutMs ?? 30 * 60 * 1000,
		signal: opts.signal,
	});
	const durationMs = Date.now() - started;
	const parsed = parseSubagentEvents(res.stdout);

	const result: SubagentResult = {
		role: opts.role,
		taskId: opts.task.id,
		ok: res.code === 0 && !res.killed,
		exitCode: res.code,
		durationMs,
		finalText: parsed.finalText,
		stdout: res.stdout,
		stderr: res.stderr,
		killed: res.killed,
		usage: parsed.usage,
		model: parsed.model,
	};
	return result;
};

/**
 * `withRetry` — run a spawn, retrying transient failures up to `maxAttempts`.
 * A failure is "transient" when exitCode !== 0 AND the result has empty
 * `finalText` (the subagent didn't even produce output). Permanent failures
 * (the subagent produced output but failed) are returned as-is.
 */
export async function withRetry(
	spawn: SpawnFn,
	pi: ExtensionAPI,
	cwd: string,
	exe: { command: string; prefixArgs: string[] },
	opts: SpawnOptions,
	maxAttempts = 2,
): Promise<SubagentResult> {
	let last: SubagentResult | undefined;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const r = await spawn(pi, cwd, exe, opts);
		if (r.ok) return r;
		// Don't retry if we got meaningful output (likely a permanent failure).
		if (r.finalText.trim().length > 0) return r;
		last = r;
	}
	// Return the last attempt with a synthetic stderr annotation.
	if (!last) {
		return {
			role: opts.role,
			taskId: opts.task.id,
			ok: false,
			exitCode: 1,
			durationMs: 0,
			finalText: "",
			stdout: "",
			stderr: `withRetry: no result after ${maxAttempts} attempts`,
			killed: false,
			usage: emptyUsage(),
		};
	}
	last.stderr = `${last.stderr}\n[lameduck] retry exhausted after ${maxAttempts} attempts`.trim();
	return last;
}

/** Sum a list of results' token usage. */
export function aggregateUsage(results: SubagentResult[]): TokenUsage {
	const total = emptyUsage();
	for (const r of results) {
		total.input += r.usage.input;
		total.output += r.usage.output;
		total.cacheRead += r.usage.cacheRead;
		total.cacheWrite += r.usage.cacheWrite;
		total.totalTokens += r.usage.totalTokens;
		total.cost += r.usage.cost;
	}
	return total;
}

/**
 * Locate the `pi` executable on disk. Mirrors the resolution strategy used
 * by ai-workflow: env var → PATH (skipping `.cmd`/`.bat` on Windows) →
 * fallback to `node + cli.js` from the installed pi-coding-agent package.
 */
export interface PiBin {
	command: string;
	prefixArgs: string[];
}

export function resolvePiBin(cwd: string): PiBin {
	if (process.env.PI_BIN) {
		return { command: process.env.PI_BIN, prefixArgs: [] };
	}
	const sep = process.platform === "win32" ? ";" : ":";
	const pathDirs = (process.env.PATH ?? "").split(sep).filter(Boolean);
	const candidates = process.platform === "win32" ? ["pi.exe"] : ["pi"];
	for (const dir of pathDirs) {
		for (const name of candidates) {
			const candidate = join(dir, name);
			if (existsSync(candidate)) return { command: candidate, prefixArgs: [] };
		}
	}
	// Fallback: node + cli.js from a few candidate dirs.
	const tried: string[] = [];
	const candidates2 = [
		join(cwd, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
		join(dirname(process.execPath), "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
		join(nodeHomedir(), ".pi", "agent", "node_modules", "@earendil-works", "pi-coding-agent", "dist", "cli.js"),
	];
	for (const c of candidates2) {
		tried.push(c);
		if (existsSync(c)) return { command: process.execPath, prefixArgs: [c] };
	}
	throw new Error(
		`lameduck: could not locate "pi" on PATH and no fallback cli.js found.\n` +
			`Set $PI_BIN or install pi globally. Tried: ${tried.filter(Boolean).join(", ")}`,
	);
}

/** Build the prompt body sent to a subagent. Kept terse on purpose. */
export function buildSubagentPrompt(args: {
	role: RoleId;
	task: Task;
	feature: string;
	backlog: string;
	coverageThreshold?: number;
}): string {
	const { role, task, feature, backlog, coverageThreshold } = args;
	const isCoverage = role === "coverage";
	const coverageNote = isCoverage
		? `\n## Coverage gate (mandatory)\n\nEnd your final report with a single line of the form:\n\n  \`Coverage: NN.N%\`\n\n(replace NN.N with the overall test coverage percentage for the changes you observed).\n`
		: "";
	return [
		`# Role: ${role}`,
		"",
		`# Feature: ${feature}`,
		`# Task: ${task.id} — ${task.title}`,
		`# Phase: ${task.phase}`,
		``,
		`You are the ${role} subagent in a lameduck run. Stay inside the project's structure;`,
		`follow your skill's instructions. When you're done, end with a short "## Result" section.`,
		coverageNote,
		``,
		`---`,
		``,
		`## Backlog (excerpt)`,
		``,
		"```markdown",
		backlog,
		"```",
		``,
		coverageThreshold !== undefined ? `Coverage threshold: ${coverageThreshold}%\n` : "",
	].join("\n");
}


