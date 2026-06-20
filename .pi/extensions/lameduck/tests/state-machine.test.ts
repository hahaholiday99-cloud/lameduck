/**
 * tests/state-machine.test.ts — explicit-phase state machine + plan building.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, initRunState, planRoles, tick } from "../state/machine.ts";
import { parseArgs } from "../schema/args.ts";
import { parseBacklogMd } from "../resolver/backlog.ts";
import type { Task } from "../schema/task.ts";

const md = [
	"## Phase 1 — Foundations",
	"- [ ] T001 Backend one",
	"- [ ] T002 Frontend on React",
	"- [x] T003 Already done",
	"## Phase 2 — Integration",
	"- [ ] T004 backend two",
].join("\n");

describe("buildPlan", () => {
	const tasks = parseBacklogMd(md);

	it("filters to open tasks by default", () => {
		const args = parseArgs("001-x");
		const plan = buildPlan(tasks, args);
		assert.equal(plan.length, 3);
		assert.deepEqual(plan.map((p) => p.task.id), ["T001", "T002", "T004"]);
	});

	it("excludes design on backend tasks", () => {
		const args = parseArgs("001-x");
		const plan = buildPlan(tasks, args);
		const t001 = plan.find((p) => p.task.id === "T001");
		assert.ok(t001);
		assert.ok(!t001.inTaskRoles.includes("design"));
	});

	it("includes design on frontend tasks", () => {
		const args = parseArgs("001-x");
		const plan = buildPlan(tasks, args);
		const t002 = plan.find((p) => p.task.id === "T002");
		assert.ok(t002);
		assert.ok(t002.inTaskRoles.includes("design"));
	});

	it("respects --no-design", () => {
		const args = parseArgs("001-x --no-design");
		const plan = buildPlan(tasks, args);
		assert.ok(plan.every((p) => !p.inTaskRoles.includes("design")));
	});

	it("respects --force-design", () => {
		const args = parseArgs("001-x --force-design");
		const plan = buildPlan(tasks, args);
		assert.ok(plan.every((p) => p.inTaskRoles.includes("design")));
	});

	it("respects --task-ids", () => {
		const args = parseArgs("001-x T001");
		const plan = buildPlan(tasks, args);
		assert.equal(plan.length, 1);
		assert.equal(plan[0]?.task.id, "T001");
	});

	it("planRoles aggregates role sets", () => {
		const args = parseArgs("001-x");
		const plan = buildPlan(tasks, args);
		const { inTask, post } = planRoles(plan);
		assert.ok(inTask.has("implement"));
		assert.ok(inTask.has("coverage"));
		assert.ok(inTask.has("design"));
		assert.ok(post.has("review"));
		assert.ok(post.has("thermoNuclear"));
	});

	it("--no-post-review drops the review post role", () => {
		const args = parseArgs("001-x --no-post-review");
		const plan = buildPlan(tasks, args);
		assert.ok(plan.every((p) => !p.postRoles.includes("review")));
		assert.ok(plan.every((p) => p.postRoles.includes("thermoNuclear")));
	});
});

describe("tick", () => {
	it("init → resolve-feature → ensure-backlog → parse-backlog → pick-tasks → pick-roles → dry-run-plan (dry-run)", () => {
		const args = parseArgs("001-x --dry-run");
		const state = initRunState({ args, cwd: "/tmp", now: () => new Date("2026-01-01T00:00:00Z") }, "001-x");
		const tasks = parseBacklogMd(md);
		const plan = buildPlan(tasks, args);
		const ctx: import("../state/machine.ts").MachineContext = {
			feature: "001-x",
			backlogPath: "/cwd/specs/001-x/backlog.md",
			plan,
			resolvedSkills: {},
		};
		// Walk phases manually: each tick() returns the *current* state.phase
		// (the phase being processed) plus an effect that names the next phase.
		const order: string[] = [];
		let s = state;
		let c = ctx;
		for (let i = 0; i < 12; i++) {
			order.push(s.phase);
			const r = tick(s, c);
			if (r.effect.kind === "done" || r.effect.kind === "halt") {
				break;
			}
			s = { ...r.state, phase: r.effect.phase };
			c = r.ctx;
		}
		assert.deepEqual(order, [
			"init",
			"resolve-feature",
			"ensure-backlog",
			"parse-backlog",
			"dry-run-plan",
		]);
	});

	it("parse-backlog with empty plan → halt", () => {
		const args = parseArgs("001-x");
		const state = initRunState({ args, cwd: "/tmp", now: () => new Date() }, "001-x");
		const ctx: import("../state/machine.ts").MachineContext = {
			feature: "001-x",
			backlogPath: "/cwd/specs/001-x/backlog.md",
			plan: [],
			resolvedSkills: {},
		};
		// Advance: init → resolve-feature → ensure-backlog → parse-backlog (halt)
		let s = state;
		let c = ctx;
		let lastEffect: import("../state/machine.ts").Effect | undefined;
		for (let i = 0; i < 6; i++) {
			const r = tick(s, c);
			lastEffect = r.effect;
			if (r.effect.kind === "done" || r.effect.kind === "halt") break;
			s = { ...r.state, phase: r.effect.phase };
			c = r.ctx;
		}
		assert.equal(lastEffect?.kind, "halt");
		if (lastEffect?.kind === "halt") {
			assert.match(lastEffect.reason, /no tasks planned/);
		}
	});
});
