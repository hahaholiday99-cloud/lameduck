/**
 * tests/resume.test.ts — handover round-trip.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	handoverFromState,
	loadHandover,
	parseHandover,
	runStateFromHandover,
	serializeHandover,
	writeHandoverFile,
} from "../resume/index.ts";
import { initRunState } from "../state/machine.ts";
import { parseArgs } from "../schema/args.ts";
import type { RunState } from "../schema/run-state.ts";

const args = parseArgs("001-x");
const state: RunState = initRunState({ args, cwd: "/tmp", now: () => new Date("2026-06-15T12:00:00Z") }, "001-x");

describe("handover round-trip", () => {
	it("serialise → parse yields same snapshot", () => {
		const snap = handoverFromState({ ...state, phase: "in-task", feature: "001-x" });
		const text = serializeHandover(snap);
		const back = parseHandover(text);
		assert.equal(back.version, 1);
		assert.equal(back.phase, "in-task");
		assert.equal(back.feature, "001-x");
	});

	it("runStateFromHandover copies fields", () => {
		const snap = handoverFromState({ ...state, phase: "post-commit", feature: "001-x" });
		const rs = runStateFromHandover(snap, state);
		assert.equal(rs.phase, "post-commit");
		assert.equal(rs.feature, "001-x");
	});

	it("loadHandover / writeHandoverFile via stub io", () => {
		const store: Record<string, string> = {};
		const snap = handoverFromState(state);
		writeHandoverFile((p, c) => { store[p] = c; }, "/tmp/handover.md", snap);
		const back = loadHandover((p) => store[p] ?? "", "/tmp/handover.md");
		assert.equal(back.version, 1);
	});

	it("parseHandover throws on missing json block", () => {
		assert.throws(() => parseHandover("no json here"));
	});
});
