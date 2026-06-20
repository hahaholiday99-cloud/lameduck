/**
 * resume/index.ts — `handover.md` round-trip for crash-safe resume.
 *
 * HandoverSnapshot is the minimal subset of RunState we persist on every
 * transition so a `--resume` can pick up where we left off.
 */

import type { RunState, TaskOutcome } from "../schema/run-state.ts";

export interface HandoverSnapshot {
	version: 1;
	updatedAt: string;
	phase: RunState["phase"];
	feature: string;
	outcomes: TaskOutcome[];
	baseBranch: string;
	haltReason?: string;
}

export function handoverFromState(state: RunState): HandoverSnapshot {
	return {
		version: 1,
		updatedAt: state.updatedAt,
		phase: state.phase,
		feature: state.feature,
		outcomes: state.outcomes,
		baseBranch: state.baseBranch,
		haltReason: state.haltReason,
	};
}

export function runStateFromHandover(snap: HandoverSnapshot, state: RunState): RunState {
	return {
		...state,
		phase: snap.phase,
		feature: snap.feature,
		outcomes: snap.outcomes,
		baseBranch: snap.baseBranch,
		haltReason: snap.haltReason,
		updatedAt: snap.updatedAt,
	};
}

export function serializeHandover(snap: HandoverSnapshot): string {
	return ["# lameduck handover", "", "```json", JSON.stringify(snap, null, 2), "```", ""].join("\n");
}

export function parseHandover(markdown: string): HandoverSnapshot {
	const m = markdown.match(/```json\s*([\s\S]*?)```/);
	if (!m) throw new Error("handover.md: no JSON block found");
	const json = m[1] ?? "";
	const obj = JSON.parse(json) as HandoverSnapshot;
	if (obj.version !== 1) throw new Error(`handover.md: unsupported version ${obj.version}`);
	return obj;
}

export function writeHandoverFile(write: (path: string, content: string) => void, path: string, snap: HandoverSnapshot): void {
	write(path, serializeHandover(snap));
}

export function loadHandover(read: (path: string) => string, path: string): HandoverSnapshot {
	return parseHandover(read(path));
}
