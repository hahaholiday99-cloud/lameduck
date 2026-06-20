/**
 * tests/roles.test.ts — role registry + frontend heuristic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { IN_TASK_ROLES, POST_ROLES, ROLES, isFrontendTask, resolveInTaskRolesForTask, resolvePostRoles } from "../schema/roles.ts";

describe("isFrontendTask", () => {
	it("detects React", () => {
		assert.equal(isFrontendTask({ title: "Build React component", raw: "" }), true);
	});
	it("does not flag backend keywords", () => {
		assert.equal(isFrontendTask({ title: "Refactor db schema", raw: "" }), false);
	});
	it("matches Tailwind / Vite / Storybook", () => {
		assert.equal(isFrontendTask({ title: "Add tailwind to landing", raw: "" }), true);
		assert.equal(isFrontendTask({ title: "Set up Vite build", raw: "" }), true);
		assert.equal(isFrontendTask({ title: "Wire up Storybook", raw: "" }), true);
	});
});

describe("resolveInTaskRolesForTask", () => {
	const backend = { title: "Refactor db", raw: "", flags: [] };
	const frontend = { title: "Build React dashboard", raw: "", flags: [] };

	it("default = all in-task roles minus design on backend", () => {
		const r = resolveInTaskRolesForTask(backend, {});
		assert.ok(r.includes("implement"));
		assert.ok(r.includes("coverage"));
		assert.ok(!r.includes("design"));
		assert.equal(r.length, IN_TASK_ROLES.length - 1);
	});

	it("frontend includes design", () => {
		const r = resolveInTaskRolesForTask(frontend, {});
		assert.ok(r.includes("design"));
	});

	it("--force-design on backend includes design", () => {
		const r = resolveInTaskRolesForTask(backend, { forceDesign: true });
		assert.ok(r.includes("design"));
	});

	it("--no-design overrides --force-design", () => {
		const r = resolveInTaskRolesForTask(frontend, { forceDesign: true, noDesign: true });
		assert.ok(!r.includes("design"));
	});

	it("--role restrict trims set", () => {
		const r = resolveInTaskRolesForTask(frontend, { roles: ["implement"] });
		assert.deepEqual(r, ["implement"]);
	});
});

describe("resolvePostRoles", () => {
	it("returns both by default", () => {
		assert.deepEqual(resolvePostRoles({}), POST_ROLES);
	});
	it("--no-post-review drops review", () => {
		assert.deepEqual(resolvePostRoles({ noPostReview: true }), ["thermoNuclear"]);
	});
	it("--no-thermo-nuclear drops thermoNuclear", () => {
		assert.deepEqual(resolvePostRoles({ noThermoNuclear: true }), ["review"]);
	});
});

describe("ROLES registry", () => {
	it("every role has a unique id", () => {
		const ids = new Set<string>();
		for (const def of Object.values(ROLES)) {
			assert.ok(!ids.has(def.id), `duplicate role id: ${def.id}`);
			ids.add(def.id);
		}
	});
	it("every role has a skillDir", () => {
		for (const def of Object.values(ROLES)) {
			assert.ok(def.skillDir.length > 0);
		}
	});
});
