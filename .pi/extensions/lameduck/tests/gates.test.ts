/**
 * tests/gates.test.ts — coverage + consent gates.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkConsentGate, checkCoverageGate } from "../state/gates.ts";

describe("checkCoverageGate", () => {
	it("passes when threshold=0", () => {
		const v = checkCoverageGate({ coverageRan: false, finalText: "", threshold: 0 });
		assert.equal(v.passed, true);
	});

	it("fails when coverage didn't run and threshold > 0", () => {
		const v = checkCoverageGate({ coverageRan: false, finalText: "", threshold: 80 });
		assert.equal(v.passed, false);
		assert.match(v.reason, /did not run/);
	});

	it("fails when Coverage: line is missing", () => {
		const v = checkCoverageGate({ coverageRan: true, finalText: "no number here", threshold: 80 });
		assert.equal(v.passed, false);
		assert.match(v.reason, /Coverage: NN/);
	});

	it("fails when below threshold", () => {
		const v = checkCoverageGate({ coverageRan: true, finalText: "Coverage: 50%", threshold: 80 });
		assert.equal(v.passed, false);
		assert.equal(v.coveragePct, 50);
	});

	it("passes when above threshold", () => {
		const v = checkCoverageGate({ coverageRan: true, finalText: "Coverage: 92.5%", threshold: 80 });
		assert.equal(v.passed, true);
		assert.equal(v.coveragePct, 92.5);
	});
});

describe("checkConsentGate", () => {
	it("approves on choice=approve", () => {
		const v = checkConsentGate({ hasUI: true, autoApprove: false, choice: "approve" });
		assert.equal(v.passed, true);
	});

	it("rejects on choice=reject", () => {
		const v = checkConsentGate({ hasUI: true, autoApprove: false, choice: "reject" });
		assert.equal(v.passed, false);
	});

	it("auto-approve in non-UI mode approves", () => {
		const v = checkConsentGate({ hasUI: false, autoApprove: true });
		assert.equal(v.passed, true);
	});

	it("non-UI without auto-approve rejects", () => {
		const v = checkConsentGate({ hasUI: false, autoApprove: false });
		assert.equal(v.passed, false);
		assert.match(v.reason, /defaulting to reject/);
	});
});
