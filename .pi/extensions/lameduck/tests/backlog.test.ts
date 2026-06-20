/**
 * tests/backlog.test.ts — backlog parser unit tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildBacklogFromTasks, filterByIds, flipTaskDone, openTasks, parseBacklogMd } from "../resolver/backlog.ts";

describe("parseBacklogMd", () => {
	it("parses open / done / skipped checkboxes", () => {
		const md = [
			"## Phase 1",
			"- [ ] T001 First",
			"- [x] T002 Second",
			"- [-] T003 Third",
			"",
		].join("\n");
		const tasks = parseBacklogMd(md);
		assert.equal(tasks.length, 3);
		assert.equal(tasks[0]?.id, "T001");
		assert.equal(tasks[0]?.state, "open");
		assert.equal(tasks[1]?.state, "done");
		assert.equal(tasks[2]?.state, "skipped");
		assert.equal(tasks[0]?.phase, "Phase 1");
	});

	it("ignores lines without a list marker", () => {
		const md = ["T005 in a description", "Another paragraph", "- [ ] T001 Real"].join("\n");
		const tasks = parseBacklogMd(md);
		assert.equal(tasks.length, 1);
		assert.equal(tasks[0]?.id, "T001");
	});

	it("extracts flag prefix", () => {
		const md = ["- [P] [US1] T001 has flags"].join("\n");
		const tasks = parseBacklogMd(md);
		assert.equal(tasks.length, 1);
		assert.deepEqual(tasks[0]?.flags, ["P", "US1"]);
	});

	it("openTasks filters to open", () => {
		const md = ["- [ ] T001 a", "- [x] T002 b"].join("\n");
		const open = openTasks(parseBacklogMd(md));
		assert.equal(open.length, 1);
		assert.equal(open[0]?.id, "T001");
	});

	it("filterByIds throws on unknown id", () => {
		const md = "- [ ] T001 a\n- [ ] T002 b\n";
		assert.throws(() => filterByIds(parseBacklogMd(md), ["T999"]));
	});
});

describe("flipTaskDone", () => {
	it("flips [ ] to [x]", () => {
		const md = ["- [ ] T001 a", "- [ ] T002 b"].join("\n");
		const out = flipTaskDone(md, "T001");
		assert.ok(out);
		assert.ok(out!.changed);
		assert.ok(out!.content.includes("- [x] T001"));
		assert.ok(out!.content.includes("- [ ] T002"));
	});

	it("is idempotent", () => {
		const md = "- [ ] T001 a\n";
		const out = flipTaskDone(md, "T001");
		assert.ok(out);
		const again = flipTaskDone(out!.content, "T001");
		assert.equal(again, undefined);
	});

	it("returns undefined when id not found", () => {
		const md = "- [ ] T001 a\n";
		assert.equal(flipTaskDone(md, "T999"), undefined);
	});
});

describe("buildBacklogFromTasks", () => {
	it("includes a header", () => {
		const out = buildBacklogFromTasks("- [ ] T001 a\n", "001-foo");
		assert.ok(out.startsWith("# 001-foo"));
		assert.ok(out.includes("Generated from tasks.md"));
		assert.ok(out.includes("- [ ] T001 a"));
	});
});
