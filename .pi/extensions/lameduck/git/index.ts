/**
 * git/index.ts — Git operations behind an `ExecAdapter` port (ADR-0003).
 *
 * The port is intentionally tiny: just enough to drive a stacked-diff
 * workflow. Adapters:
 *   - ShellExecAdapter — uses `pi.exec` (real git)
 *   - RecordingExecAdapter — captures calls for tests
 *
 * `nullExecAdapter` is provided for unit tests that don't touch git at all.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
	killed: boolean;
}

export interface ExecAdapter {
	exec(command: string, args: string[], options?: { cwd?: string; signal?: AbortSignal; timeout?: number }): Promise<ExecResult>;
}

export const piExecAdapter = (pi: ExtensionAPI): ExecAdapter => ({
	async exec(command, args, options) {
		const res = await pi.exec(command, args, options ?? {});
		return {
			code: res.code,
			stdout: res.stdout,
			stderr: res.stderr,
			killed: res.killed,
		};
	},
});

export function recordingExecAdapter(): ExecAdapter & { calls: Array<{ command: string; args: string[]; options?: { cwd?: string } }> } {
	const calls: Array<{ command: string; args: string[]; options?: { cwd?: string } }> = [];
	const adapter: ExecAdapter = {
		async exec(command, args, options) {
			calls.push({ command, args, options });
			return { code: 0, stdout: "", stderr: "", killed: false };
		},
	};
	return Object.assign(adapter, { calls });
}

export const nullExecAdapter: ExecAdapter = {
	async exec() {
		throw new Error("nullExecAdapter: exec() not implemented");
	},
};

// ----------------------------------------------------------------------
// GitOps — high-level wrapper
// ----------------------------------------------------------------------

export interface GitOpsDeps {
	cwd: string;
	exec: ExecAdapter;
	baseBranch?: string;
}

export class GitOps {
	constructor(private readonly deps: GitOpsDeps) {}

	private async git(args: string[]): Promise<ExecResult> {
		return this.deps.exec.exec("git", args, { cwd: this.deps.cwd });
	}

	async isRepo(): Promise<boolean> {
		return existsSync(join(this.deps.cwd, ".git"));
	}

	async init(baseBranch = "main"): Promise<{ initialised: boolean }> {
		if (await this.isRepo()) return { initialised: false };
		const init = await this.git(["init", "-b", baseBranch]);
		if (init.code !== 0) throw new Error(`git init failed: ${init.stderr}`);
		await this.git(["config", "user.name", "lameduck"]);
		await this.git(["config", "user.email", "lameduck@local"]);
		return { initialised: true };
	}

	async currentBranch(): Promise<string> {
		const r = await this.git(["rev-parse", "--abbrev-ref", "HEAD"]);
		if (r.code !== 0) return "unknown";
		return r.stdout.trim() || "unknown";
	}

	async branchExists(name: string): Promise<boolean> {
		const r = await this.git(["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
		return r.code === 0;
	}

	async createOrCheckoutBranch(branch: string, baseBranch: string): Promise<{ created: boolean; warnings: string[] }> {
		const warnings: string[] = [];
		if (await this.branchExists(branch)) {
			const co = await this.git(["checkout", branch]);
			if (co.code !== 0) throw new Error(`git checkout ${branch} failed: ${co.stderr}`);
			return { created: false, warnings };
		}
		const status = await this.git(["status", "--porcelain"]);
		let stashed = false;
		if (status.stdout.trim().length > 0) {
			const stash = await this.git(["stash", "push", "-u", "-m", `lameduck: pre-${branch}`]);
			if (stash.code === 0) stashed = true;
			else warnings.push(`git stash failed (exit ${stash.code}); proceeding with dirty tree`);
		}
		const create = await this.git(["checkout", "-b", branch, baseBranch]);
		if (create.code !== 0) {
			if (stashed) await this.git(["stash", "pop"]);
			throw new Error(`git checkout -b ${branch} ${baseBranch} failed: ${create.stderr}`);
		}
		if (stashed) {
			const pop = await this.git(["stash", "pop"]);
			if (pop.code !== 0) warnings.push(`git stash pop failed (exit ${pop.code})`);
		}
		return { created: true, warnings };
	}

	async hasChanges(): Promise<boolean> {
		const r = await this.git(["status", "--porcelain"]);
		return r.stdout.trim().length > 0;
	}

	async commitAll(message: string): Promise<{ committed: boolean; hash?: string; warnings: string[] }> {
		const warnings: string[] = [];
		if (!(await this.hasChanges())) return { committed: false, warnings };
		const add = await this.git(["add", "-A"]);
		if (add.code !== 0) throw new Error(`git add failed: ${add.stderr}`);
		const commit = await this.git(["commit", "-m", message]);
		if (commit.code !== 0) throw new Error(`git commit failed: ${commit.stderr}`);
		const h = await this.git(["rev-parse", "--short", "HEAD"]);
		const hash = h.code === 0 ? h.stdout.trim() : undefined;
		return { committed: true, hash, warnings };
	}

	async checkout(name: string): Promise<void> {
		const r = await this.git(["checkout", name]);
		if (r.code !== 0) throw new Error(`git checkout ${name} failed: ${r.stderr}`);
	}
}
