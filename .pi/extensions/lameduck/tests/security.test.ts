/**
 * tests/security.test.ts — security contract parser/formatter.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSecurityReport, normaliseSeverity, parseSecurityReport, scoreSeverity } from "../security/contract.ts";

describe("normaliseSeverity", () => {
	it("maps aliases", () => {
		assert.equal(normaliseSeverity("HIGH"), "high");
		assert.equal(normaliseSeverity("med"), "medium");
		assert.equal(normaliseSeverity("Crit"), "critical");
		assert.equal(normaliseSeverity("INFO"), "info");
		assert.equal(normaliseSeverity("nope"), undefined);
	});
});

describe("parseSecurityReport", () => {
	it("parses [SEV] Title lines", () => {
		const md = ["# Findings", "- [HIGH] SQL injection in /api/users", "- [low] Missing CSP header", "- [MED] Verbose error messages"].join("\n");
		const findings = parseSecurityReport(md);
		assert.equal(findings.length, 3);
		assert.equal(findings[0]?.severity, "high");
		assert.equal(findings[1]?.severity, "low");
		assert.equal(findings[2]?.severity, "medium");
	});

	it("returns empty for empty input", () => {
		assert.deepEqual(parseSecurityReport(""), []);
	});
});

describe("scoreSeverity", () => {
	it("picks max severity", () => {
		const s = scoreSeverity([
			{ id: "S001", severity: "low", title: "x" },
			{ id: "S002", severity: "critical", title: "y" },
		]);
		assert.equal(s.max, "critical");
		assert.equal(s.counts.critical, 1);
		assert.equal(s.counts.low, 1);
	});

	it("zero on no findings", () => {
		const s = scoreSeverity([]);
		assert.equal(s.max, "info");
		assert.equal(s.score, 0);
	});
});

describe("formatSecurityReport", () => {
	it("emits a header + findings", () => {
		const out = formatSecurityReport([{ id: "S001", severity: "high", title: "x" }]);
		assert.ok(out.startsWith("# Security findings"));
		assert.ok(out.includes("[HIGH] x"));
	});

	it("emits no-findings marker", () => {
		const out = formatSecurityReport([]);
		assert.ok(out.includes("No findings."));
	});
});
