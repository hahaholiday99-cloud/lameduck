/**
 * tests/args.test.ts — arg parser unit tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultArgs, parseArgs, tokenize, helpText } from "../schema/args.ts";

describe("tokenize", () => {
	it("splits on whitespace and respects quotes", () => {
		assert.deepEqual(tokenize("a b  c"), ["a", "b", "c"]);
		assert.deepEqual(tokenize(`"a b" c`), ["a b", "c"]);
	});
});

describe("parseArgs", () => {
	it("returns defaults when no flags", () => {
		const a = parseArgs("001-llm-perf");
		assert.equal(a.feature, "001-llm-perf");
		assert.equal(a.coverageThreshold, 80);
		assert.equal(a.parallelism, "sequential");
		assert.equal(a.dryRun, false);
	});

	it("parses --role", () => {
		const a = parseArgs("--role implement,coverage");
		assert.deepEqual(a.roles, ["implement", "coverage"]);
	});

	it("parses --coverage-threshold", () => {
		const a = parseArgs("--coverage-threshold 90");
		assert.equal(a.coverageThreshold, 90);
	});

	it("rejects invalid coverage threshold", () => {
		assert.throws(() => parseArgs("--coverage-threshold abc"));
		assert.throws(() => parseArgs("--coverage-threshold 150"));
	});

	it("parses task ids", () => {
		const a = parseArgs("001-foo T001 T017");
		assert.deepEqual(a.taskIds, ["T001", "T017"]);
	});

	it("parses --dry-run + --help", () => {
		assert.equal(parseArgs("--dry-run").dryRun, true);
		assert.equal(parseArgs("--help").help, true);
	});

	it("parses opt-outs", () => {
		const a = parseArgs("--no-design --no-architecture --no-coverage");
		assert.equal(a.noDesign, true);
		assert.equal(a.noArchitecture, true);
		assert.equal(a.noCoverage, true);
	});

	it("rejects unknown flags", () => {
		assert.throws(() => parseArgs("--nope"));
	});

	it("defaultArgs is independent between calls", () => {
		const a = defaultArgs();
		const b = defaultArgs();
		a.taskIds.push("T001");
		assert.deepEqual(b.taskIds, []);
	});

	it("helpText mentions every flag", () => {
		const t = helpText();
		for (const flag of ["--dry-run", "--auto-approve", "--no-post-review", "--no-thermo-nuclear", "--coverage-threshold", "--force-design", "--path", "--role", "--base-branch"]) {
			assert.ok(t.includes(flag), `helpText missing ${flag}`);
		}
	});
});
