/**
 * schema/args.ts — Parsed CLI args for `/lameduck`.
 *
 * Hand-rolled validation (no Zod) to keep the dependency surface tight.
 * The shape is shared across the entry point and the state machine.
 */

export type Parallelism = "parallel" | "sequential";

export interface ParsedArgs {
	/** Positional: feature dir under specs/, or undefined → picker. */
	feature?: string;
	/** Positional: explicit task ids (T001, T017) to filter on. */
	taskIds: string[];
	/** Override backlog file path. */
	path?: string;
	/** Subset of in-task roles to run (default: all 4 in-task). */
	roles?: string[];
	parallelism: Parallelism;
	model?: string;
	thinking?: string;
	coverageThreshold: number;
	baseBranch: string;
	branchPrefix: string;
	autoApprove: boolean;
	noPostReview: boolean;
	noThermoNuclear: boolean;
	noDesign: boolean;
	noArchitecture: boolean;
	noImplement: boolean;
	noCoverage: boolean;
	noSecurity: boolean;
	forceDesign: boolean;
	dryRun: boolean;
	help: boolean;
}

export const DEFAULT_ARGS: ParsedArgs = {
	taskIds: [],
	parallelism: "sequential",
	coverageThreshold: 80,
	baseBranch: "main",
	branchPrefix: "",
	// branchPrefix is filled in once we know the feature name.
	autoApprove: false,
	noPostReview: false,
	noThermoNuclear: false,
	noDesign: false,
	noArchitecture: false,
	noImplement: false,
	noCoverage: false,
	noSecurity: false,
	forceDesign: false,
	dryRun: false,
	help: false,
};

/** Return a freshly-cloned default, safe to mutate. */
export function defaultArgs(): ParsedArgs {
	return { ...DEFAULT_ARGS, taskIds: [], roles: undefined };
}

/** Walk argv tokens; mutate and return `parsed`. Unknown flags → throw. */
export function parseArgs(raw: string, parsed: ParsedArgs = defaultArgs()): ParsedArgs {
	const tokens = tokenize(raw);
	for (let i = 0; i < tokens.length; i++) {
		const tok = tokens[i];
		if (tok === undefined) continue;
		if (tok === "--help" || tok === "-h") {
			parsed.help = true;
			continue;
		}
		if (tok === "--dry-run") {
			parsed.dryRun = true;
			continue;
		}
		if (tok === "--parallel") {
			parsed.parallelism = "parallel";
			continue;
		}
		if (tok === "--sequential") {
			parsed.parallelism = "sequential";
			continue;
		}
		if (tok === "--auto-approve") {
			parsed.autoApprove = true;
			continue;
		}
		if (tok === "--force-design") {
			parsed.forceDesign = true;
			continue;
		}
		// --no-* toggles
		if (tok === "--no-post-review") {
			parsed.noPostReview = true;
			continue;
		}
		if (tok === "--no-thermo-nuclear") {
			parsed.noThermoNuclear = true;
			continue;
		}
		if (tok === "--no-design") {
			parsed.noDesign = true;
			continue;
		}
		if (tok === "--no-architecture") {
			parsed.noArchitecture = true;
			continue;
		}
		if (tok === "--no-implement") {
			parsed.noImplement = true;
			continue;
		}
		if (tok === "--no-coverage") {
			parsed.noCoverage = true;
			continue;
		}
		if (tok === "--no-security") {
			parsed.noSecurity = true;
			continue;
		}
		// --flag value pairs
		const valueFlag = (name: string): string | undefined => {
			if (tok !== name) return undefined;
			const next = tokens[i + 1];
			if (next === undefined || next.startsWith("--")) {
				throw new Error(`lameduck: ${name} requires a value`);
			}
			i++;
			return next;
		};
		const roleV = valueFlag("--role");
		if (roleV !== undefined) {
			parsed.roles = roleV
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			continue;
		}
		const pathV = valueFlag("--path");
		if (pathV !== undefined) {
			parsed.path = pathV;
			continue;
		}
		const modelV = valueFlag("--model");
		if (modelV !== undefined) {
			parsed.model = modelV;
			continue;
		}
		const thinkingV = valueFlag("--thinking");
		if (thinkingV !== undefined) {
			parsed.thinking = thinkingV;
			continue;
		}
		const covV = valueFlag("--coverage-threshold");
		if (covV !== undefined) {
			const n = Number(covV);
			if (!Number.isFinite(n) || n < 0 || n > 100) {
				throw new Error(`lameduck: --coverage-threshold must be 0..100, got "${covV}"`);
			}
			parsed.coverageThreshold = n;
			continue;
		}
		const baseV = valueFlag("--base-branch");
		if (baseV !== undefined) {
			parsed.baseBranch = baseV;
			continue;
		}
		const prefixV = valueFlag("--branch-prefix");
		if (prefixV !== undefined) {
			parsed.branchPrefix = prefixV;
			continue;
		}
		// Positional tokens: feature (first non-T-id) or task ids.
		if (tok.startsWith("--")) {
			throw new Error(`lameduck: unknown flag "${tok}"`);
		}
		if (/^T\d{3}$/i.test(tok)) {
			parsed.taskIds.push(tok.toUpperCase());
			continue;
		}
		if (parsed.feature === undefined) {
			parsed.feature = tok;
			continue;
		}
		throw new Error(`lameduck: unexpected positional argument "${tok}"`);
	}
	return parsed;
}

/** Naive shell-style tokenizer: split on whitespace, honour double quotes. */
export function tokenize(raw: string): string[] {
	const out: string[] = [];
	let cur = "";
	let inQuote = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (!inQuote && (ch === " " || ch === "\t")) {
			if (cur.length > 0) {
				out.push(cur);
				cur = "";
			}
			continue;
		}
		cur += ch;
	}
	if (cur.length > 0) out.push(cur);
	return out;
}

/** Pretty help text shown on `--help` / `-h`. */
export function helpText(): string {
	return [
		"Usage: /lameduck [<feature>] [--path <file>] [--role r1,r2] [T001 T005 ...] [flags]",
		"",
		"Flags:",
		"  --path <file>            Use this backlog file instead of specs/<feature>/backlog.md",
		"  --role <list>            Comma subset of in-task roles: design,architecture,implement,coverage,security",
		"  --parallel | --sequential  Run in-task subagents concurrently (default sequential)",
		"  --model <pattern>        Forwarded to every subagent (e.g. anthropic/claude-sonnet-4-5)",
		"  --thinking <lvl>         off|minimal|low|medium|high|xhigh",
		"  --coverage-threshold <n> 0..100 (default 80; 0 disables)",
		"  --base-branch <name>     Branch base (default main)",
		"  --branch-prefix <p>      Branch-name prefix (default feat/<feature>/)",
		"  --auto-approve           Skip human review gate (CI mode)",
		"  --no-post-review         Skip the open-code-review subagent",
		"  --no-thermo-nuclear      Skip the thermo-nuclear review subagent",
		"  --no-design              Skip the design (impeccable) subagent",
		"  --no-architecture        Skip the architecture subagent",
		"  --no-implement           Skip the TDD implement subagent",
		"  --no-coverage            Skip the coverage subagent (also disables the gate)",
		"  --no-security            Skip the semgrep security subagent",
		"  --force-design           Always run the design subagent",
		"  --dry-run                Resolve and print the plan, exit without writing anything",
		"  --help, -h               Show this help",
	].join("\n");
}
