/**
 * tests/subagent-parser.test.ts — JSON event stream parser + coverage gate.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addUsage, emptyUsage, extractCoveragePct, parseSubagentEvents } from "../subagent/parser.ts";

describe("addUsage", () => {
	it("is additive and defensive", () => {
		const a = emptyUsage();
		addUsage(a, { input: 100, output: 50, cost: 0.01 });
		addUsage(a, { input: 200 });
		assert.equal(a.input, 300);
		assert.equal(a.output, 50);
		assert.equal(a.cost, 0.01);
	});

	it("ignores undefined", () => {
		const a = emptyUsage();
		addUsage(a, undefined);
		assert.deepEqual(a, emptyUsage());
	});
});

describe("parseSubagentEvents", () => {
	it("extracts the last assistant text + usage", () => {
		const stdout = [
			JSON.stringify({ type: "agent_start" }),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					model: "claude",
					content: [{ type: "text", text: "first" }],
					usage: { input: 10, output: 20, cost: 0.001 },
				},
			}),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "user",
					content: [{ type: "text", text: "ignored" }],
				},
			}),
			JSON.stringify({
				type: "message_end",
				message: {
					role: "assistant",
					model: "claude",
					content: [{ type: "text", text: "second" }],
					usage: { input: 30, output: 40, cost: 0.002 },
				},
			}),
		].join("\n");
		const parsed = parseSubagentEvents(stdout);
		assert.equal(parsed.finalText, "second");
		assert.equal(parsed.usage.input, 40);
		assert.equal(parsed.usage.output, 60);
		assert.equal(parsed.usage.cost, 0.003);
		assert.equal(parsed.model, "claude");
	});

	it("skips malformed lines", () => {
		const stdout = [
			"not-json",
			"",
			JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } }),
		].join("\n");
		const parsed = parseSubagentEvents(stdout);
		assert.equal(parsed.finalText, "ok");
	});

	it("returns empty for empty input", () => {
		const parsed = parseSubagentEvents("");
		assert.equal(parsed.finalText, "");
		assert.deepEqual(parsed.usage, emptyUsage());
	});
});

describe("extractCoveragePct", () => {
	it("extracts Coverage: 85.5%", () => {
		assert.equal(extractCoveragePct("Some prose\nCoverage: 85.5%\n"), 85.5);
	});

	it("is case-insensitive", () => {
		assert.equal(extractCoveragePct("coverage: 70%\n"), 70);
	});

	it("returns undefined when not present", () => {
		assert.equal(extractCoveragePct("no coverage line"), undefined);
	});
});
