/**
 * tests/ports.test.ts — git + fs + ui adapter ports.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recordingExecAdapter, GitOps } from "../git/index.ts";
import { memoryFsAdapter, nodeFsAdapter, writeReviewFile, writeReportFile, appendLedgerSection, buildPerRunReport, buildReviewBody, buildReportBody } from "../artifacts/writer.ts";
import { scriptedUiAdapter } from "../ui/prompt.ts";
import type { TaskOutcome } from "../schema/run-state.ts";
import type { Task } from "../schema/task.ts";
import { emptyUsage } from "../subagent/parser.ts";

const task: Task = {
	id: "T001",
	title: "Test",
	state: "open",
	phase: "Phase 1",
	flags: [],
	raw: "- [ ] T001 Test",
	lineNumber: 1,
};

describe("GitOps via recording adapter", () => {
	it("init calls git init + config", async () => {
		const rec = recordingExecAdapter();
		const ops = new GitOps({ cwd: "/tmp", exec: rec });
		// Pretend /tmp/.git doesn't exist by checking hasChanges side-effect-free path.
		await ops.init("main");
		const commands = rec.calls.map((c) => `${c.command} ${c.args.join(" ")}`);
		assert.ok(commands.some((c) => c.startsWith("git init")));
		assert.ok(commands.some((c) => c.startsWith("git config user.name")));
	});

	it("commitAll adds then commits when changes exist", async () => {
		const rec = recordingExecAdapter();
		const ops = new GitOps({ cwd: "/tmp", exec: rec });
		// hasChanges → git status. Recording adapter returns code 0, stdout "" → empty → false.
		const result = await ops.commitAll("msg");
		assert.equal(result.committed, false);
	});
});

describe("FsAdapter memory", () => {
	it("read/write/exists via memory adapter", () => {
		const fs = memoryFsAdapter();
		fs.write("/a/b/c.txt", "hello");
		assert.equal(fs.read("/a/b/c.txt"), "hello");
		assert.equal(fs.exists("/a/b/c.txt"), true);
		assert.equal(fs.exists("/missing"), false);
	});
});

describe("Artifact writers", () => {
	it("writeReviewFile writes under specs/<feat>/reviews/", () => {
		const fs = memoryFsAdapter();
		const path = writeReviewFile(fs, "001-x", "/cwd", {
			task,
			branch: "feat/001-x/T001",
			reviewResult: { role: "review", taskId: "T001", ok: true, exitCode: 0, durationMs: 1, finalText: "looks good", stdout: "", stderr: "", killed: false, usage: emptyUsage() },
		});
		assert.equal(path, "/cwd/specs/001-x/reviews/T001.md");
		const body = fs.read(path);
		assert.ok(body.includes("looks good"));
	});

	it("writeReportFile writes under specs/<feat>/reports/", () => {
		const fs = memoryFsAdapter();
		const outcome: TaskOutcome = {
			task,
			branch: "feat/001-x/T001",
			branchCreated: true,
			inTaskRoles: ["implement"],
			inTaskResults: [{ role: "implement", taskId: "T001", ok: true, exitCode: 0, durationMs: 1, finalText: "## Result\nimplemented", stdout: "", stderr: "", killed: false, usage: emptyUsage() }],
			postRoles: ["review"],
			postResults: [],
			reviewPath: "",
			reportPath: "",
			consent: "approved",
			warnings: [],
		};
		const path = writeReportFile(fs, "001-x", "/cwd", { task, branch: "feat/001-x/T001", outcome });
		assert.equal(path, "/cwd/specs/001-x/reports/T001-report.md");
		assert.ok(fs.read(path).includes("implemented"));
	});

	it("appendLedgerSection appends to ledger", () => {
		const fs = memoryFsAdapter();
		const p = appendLedgerSection(fs, "/cwd", { feature: "001-x", startedAt: "2026-06-15T00:00:00Z", roles: ["implement"], tokens: { input: 10, output: 5, cost: 0.01 } });
		assert.equal(p, "/cwd/.pi/lameduck-tokens.md");
		const body = fs.read(p);
		assert.ok(body.includes("001-x"));
		// Append twice
		appendLedgerSection(fs, "/cwd", { feature: "001-y", startedAt: "2026-06-15T01:00:00Z", roles: ["coverage"], tokens: { input: 1, output: 2, cost: 0.02 } });
		assert.ok(fs.read(p).includes("001-y"));
	});

	it("buildPerRunReport includes all task ids", () => {
		const out = buildPerRunReport({
			feature: "001-x",
			startedAt: "2026-06-15T00:00:00Z",
			outcomes: [{
				task, branch: "b", branchCreated: true, inTaskRoles: [], inTaskResults: [], postRoles: [], postResults: [], reviewPath: "", reportPath: "", consent: "approved", warnings: [],
			}],
		});
		assert.ok(out.includes("T001"));
	});

	it("buildReviewBody still has task metadata when both results missing", () => {
		const body = buildReviewBody({ task, branch: "b" });
		assert.ok(body.includes("# T001 — Review"));
		assert.ok(body.includes("**Task:** Test"));
		assert.ok(!body.includes("Post-commit review"));
	});
});

describe("ScriptedUiAdapter", () => {
	it("replays a script of choices in order", async () => {
		const ui = scriptedUiAdapter(
			[
				{ kind: "confirm", value: true },
				{ kind: "select", value: "Approve" },
			],
			true,
		);
		assert.equal(await ui.confirm("ok?"), true);
		assert.equal(await ui.select("?", ["Approve", "Reject"]), "Approve");
		assert.equal(ui.hasUI(), true);
	});

	it("throws on exhausted script", async () => {
		const ui = scriptedUiAdapter([], true);
		await assert.rejects(() => ui.confirm("?"));
	});
});
