/**
 * state/gates.ts — Quality gates between subagents and the next task.
 *
 * Two gates today:
 *   - Coverage gate: parse `Coverage: NN.N%` from the coverage subagent's
 *     final text, compare against `threshold`.
 *   - Consent gate: ask the human (or autoApprove / scripted UI) to
 *     approve or reject the task before flipping `[x]`.
 */

import type { GateVerdict } from "../schema/run-state.ts";
import { extractCoveragePct } from "../subagent/parser.ts";

export function checkCoverageGate(args: {
	coverageRan: boolean;
	finalText: string;
	threshold: number;
}): GateVerdict {
	const { coverageRan, finalText, threshold } = args;
	if (threshold <= 0) {
		return { passed: true, reason: "coverage gate disabled (threshold=0)" };
	}
	if (!coverageRan) {
		return { passed: false, reason: "coverage subagent did not run but threshold > 0" };
	}
	const pct = extractCoveragePct(finalText);
	if (pct === undefined) {
		return { passed: false, reason: "coverage subagent did not emit `Coverage: NN.N%` line", threshold };
	}
	if (pct < threshold) {
		return { passed: false, reason: `coverage ${pct.toFixed(1)}% < threshold ${threshold}%`, coveragePct: pct, threshold };
	}
	return { passed: true, reason: `coverage ${pct.toFixed(1)}% ≥ threshold ${threshold}%`, coveragePct: pct, threshold };
}

export function checkConsentGate(args: {
	hasUI: boolean;
	autoApprove: boolean;
	choice?: "approve" | "reject";
}): GateVerdict {
	const { hasUI, autoApprove, choice } = args;
	if (choice !== undefined) {
		return choice === "approve"
			? { passed: true, reason: "human approved" }
			: { passed: false, reason: "human rejected" };
	}
	if (!hasUI) {
		// Non-UI without explicit choice + without --auto-approve → reject.
		return autoApprove
			? { passed: true, reason: "auto-approved (non-UI + --auto-approve)" }
			: { passed: false, reason: "non-UI without --auto-approve: defaulting to reject" };
	}
	return { passed: false, reason: "no consent recorded" };
}
