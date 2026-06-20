/**
 * schema/task.ts — Task shape parsed from `backlog.md`.
 *
 * A task is one `- [ ] T001 ...` line in the markdown backlog.
 * Tasks belong to a `phase` (the most recent `## Phase N` heading).
 */

export type TaskState = "open" | "done" | "skipped";

export interface Task {
	/** Unique id parsed from the line, e.g. "T001". */
	id: string;
	/** Task title — the rest of the line after the id, trimmed. */
	title: string;
	/** Current state. */
	state: TaskState;
	/** Phase heading the task lives under (e.g. "Phase 1 — Foundations"). */
	phase: string;
	/** Free-form flags extracted from `[xxx]` markers in the line, e.g. ["US1","P"]. */
	flags: string[];
	/** Original line text (handy for round-tripping). */
	raw: string;
	/** 1-based line number in the source file. */
	lineNumber: number;
}

/** True if the task id matches `Txxx` where xxx is 3+ digits. */
export function isTaskId(s: string): boolean {
	return /^T\d{3,}$/i.test(s);
}
