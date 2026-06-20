/**
 * resolver/backlog.ts — Pure markdown → Task[] parser.
 *
 * Recognises:
 *   - `## Phase N — Title`           (phase heading)
 *   - `- [ ] T001 Title…`            (open task)
 *   - `- [x] T001 Title…`            (done)
 *   - `- [-] T001 Title…`            (skipped / cancelled)
 *   - `- [P] [US1] T001 Title…`      (with flag prefix)
 *
 * Lines without a list-item marker (`-`, `*`, `+`) are ignored.
 */

import { isTaskId, type Task } from "../schema/task.ts";

const TASK_LINE = /^([\-\*\+])\s+\[([^\]])\]\s+(.*)$/;
const PHASE_LINE = /^#{2,}\s+(.*\S)\s*$/;
const FLAG_TOKEN = /^\[([A-Za-z0-9_-]+)\]\s*/;

export function parseBacklogMd(content: string): Task[] {
	const tasks: Task[] = [];
	let phase = "(unspecified)";
	const lines = content.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		const trimmed = line.trimEnd();

		const phaseMatch = trimmed.match(PHASE_LINE);
		if (phaseMatch) {
			phase = phaseMatch[1] ?? phase;
			continue;
		}

		const m = trimmed.match(TASK_LINE);
		if (!m) continue;
		const marker = m[1];
		const stateCharRaw = m[2] ?? "";
		const stateChar = stateCharRaw.toLowerCase();
		let rest = (m[3] ?? "").trim();
		if (!rest) continue;

		const flags: string[] = [];
		// If the state char is a recognised real state, keep it; otherwise
		// treat the inner content as a flag (e.g. `[P]`, `[US1]`).
		const isRealState = stateChar === " " || stateChar === "x" || stateChar === "-";
		if (!isRealState) {
			flags.push(stateCharRaw);
		}
		while (true) {
			const fm = rest.match(FLAG_TOKEN);
			if (!fm) break;
			flags.push(fm[1] ?? "");
			rest = rest.slice(fm[0].length);
		}

		// Extract leading T-id.
		const tokenMatch = rest.match(/^(\S+)\s+(.*)$/);
		if (!tokenMatch) continue;
		const id = tokenMatch[1] ?? "";
		if (!isTaskId(id)) continue;
		const title = (tokenMatch[2] ?? "").trim();

		const state: Task["state"] = stateChar === "x" ? "done" : stateChar === "-" ? "skipped" : "open";

		tasks.push({
			id: id.toUpperCase(),
			title,
			state,
			phase,
			flags,
			raw: trimmed,
			lineNumber: i + 1,
		});
		// marker unused — list-item char is informational only.
		void marker;
	}
	return tasks;
}

/** Return only open tasks. */
export function openTasks(tasks: Task[]): Task[] {
	return tasks.filter((t) => t.state === "open");
}

/** Filter to a set of task ids (case-insensitive). Throws on unknown id. */
export function filterByIds(tasks: Task[], ids: string[]): Task[] {
	if (ids.length === 0) return tasks;
	const want = new Set(ids.map((s) => s.toUpperCase()));
	const present = new Set(tasks.map((t) => t.id));
	for (const id of want) {
		if (!present.has(id)) {
			throw new Error(`lameduck: unknown task id "${id}" in backlog`);
		}
	}
	return tasks.filter((t) => want.has(t.id));
}

/**
 * Flip a single `- [ ] T001 …` to `- [x] T001 …`. Idempotent.
 * Returns the new content, or `undefined` if the line was already `[x]` / not found.
 */
export function flipTaskDone(content: string, taskId: string): { content: string; changed: boolean } | undefined {
	const id = taskId.toUpperCase();
	const lines = content.split(/\r?\n/);
	let changed = false;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) continue;
		// Match the whole checkbox region: `- [` (prefix) + one char (state) + `] ` (suffix).
		const m = line.match(/^([\-\*\+]\s+)\[([^\]])\](\s+\S+.*)$/);
		if (!m) continue;
		const prefix = m[1] ?? "";
		const stateChar = (m[2] ?? "").toLowerCase();
		const suffix = m[3] ?? ""; // starts with the char after `]`
		// Extract the id from the suffix (which is everything after `]`).
		const idMatch = suffix.match(/^\s+(\S+)/);
		if (!idMatch) continue;
		if ((idMatch[1] ?? "").toUpperCase() !== id) continue;
		if (stateChar === "x") continue; // already done
		lines[i] = `${prefix}[x]${suffix}`;
		changed = true;
	}
	if (!changed) return undefined;
	return { content: lines.join("\n"), changed: true };
}

/**
 * Seed `backlog.md` from `tasks.md` if the backlog doesn't exist.
 * Returns `{ seedSource, seedTarget, seeded }`.
 */
export function buildBacklogFromTasks(tasksContent: string, feature: string): string {
	const banner = [
		`# ${feature} — Backlog`,
		"",
		`> Generated from tasks.md by lameduck. Do not edit — edit tasks.md and regenerate.`,
		"",
		"---",
		"",
	];
	return banner.join("\n") + tasksContent + "\n";
}

/** Path under `specs/<feature>/`. */
export function backlogFilePath(feature: string, cwd: string, filename = "backlog.md"): string {
	return joinPath(cwd, "specs", feature, filename);
}

/** Tiny path join that ignores node:path import-shape friction. */
export function joinPath(...parts: string[]): string {
	return parts
		.map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, "") : p.replace(/^[\\/]+|[\\/]+$/g, "")))
		.filter(Boolean)
		.join("/");
}
