/**
 * schema/roles.ts — Role registry.
 *
 * Each role binds a skill dir name to a phase (in-task vs. post-commit)
 * and a short description used in UI prompts.
 */

export type RolePhase = "in-task" | "post-commit";

export type RoleId =
	| "design"
	| "architecture"
	| "implement"
	| "coverage"
	| "security"
	| "review"
	| "thermoNuclear";

export interface RoleDef {
	id: RoleId;
	emoji: string;
	label: string;
	phase: RolePhase;
	/** Skill dir under `.pi/skills/` / `~/.pi/agent/skills/`. */
	skillDir: string;
	/** Short blurb shown to the user in pickers. */
	description: string;
}

/** Authoritative registry — order matters for pickers + dry-run plans. */
export const ROLES: Record<RoleId, RoleDef> = {
	design: {
		id: "design",
		emoji: "🎨",
		label: "design",
		phase: "in-task",
		skillDir: "impeccable",
		description: "UX / IA / a11y / motion / frontend craft.",
	},
	architecture: {
		id: "architecture",
		emoji: "🏛️",
		label: "architecture",
		phase: "in-task",
		skillDir: "improve-codebase-architecture",
		description: "Module depth, seams, the deletion test.",
	},
	implement: {
		id: "implement",
		emoji: "🧪",
		label: "implement",
		phase: "in-task",
		skillDir: "tdd",
		description: "Red-green-refactor TDD.",
	},
	coverage: {
		id: "coverage",
		emoji: "📊",
		label: "coverage",
		phase: "in-task",
		skillDir: "tdd",
		description: "Run test suite with coverage; emit Coverage: NN.N%.",
	},
	security: {
		id: "security",
		emoji: "🛡️",
		label: "security",
		phase: "in-task",
		skillDir: "semgrep",
		description: "Static + lightweight dynamic security analysis.",
	},
	review: {
		id: "review",
		emoji: "🔍",
		label: "review",
		phase: "post-commit",
		skillDir: "open-code-review",
		description: "Post-commit open-code-review pass.",
	},
	thermoNuclear: {
		id: "thermoNuclear",
		emoji: "☢️",
		label: "thermoNuclear",
		phase: "post-commit",
		skillDir: "thermo-nuclear-code-quality-review",
		description: "Post-commit thermo-nuclear maintainability review.",
	},
};

/** All in-task role ids in display order. */
export const IN_TASK_ROLES: RoleId[] = ["design", "architecture", "implement", "coverage", "security"];

/** All post-commit role ids in display order. */
export const POST_ROLES: RoleId[] = ["review", "thermoNuclear"];

/** Heuristic regex that flags a task line as "frontend". */
export const FRONTEND_REGEX =
	/\b(frontend\/|React|Vue(?:\.js)?|Angular|Svelte|Solid(?:\.js)?|TypeScript|Vite|Webpack|vitest|jest|cypress|playwright|Ant Design|Material UI|MUI|Recharts|Tailwind(?:\s*CSS)?|Storybook|next\.?js|nuxt(?:\.js)?|remix|astro)\b/i;

/** True when `task.title` or `task.raw` smells like frontend work. */
export function isFrontendTask(task: { title: string; raw: string }): boolean {
	const hay = `${task.title}\n${task.raw}`;
	return FRONTEND_REGEX.test(hay);
}

/** Resolve which in-task roles to actually run for a single task. */
export function resolveInTaskRolesForTask(
	task: { title: string; raw: string; flags: string[] },
	args: {
		roles?: string[];
		noDesign?: boolean;
		noArchitecture?: boolean;
		noImplement?: boolean;
		noCoverage?: boolean;
		noSecurity?: boolean;
		forceDesign?: boolean;
	},
): RoleId[] {
	const all = args.roles && args.roles.length > 0 ? args.roles : IN_TASK_ROLES;
	const explicit = new Set<string>(
		args.roles && args.roles.length > 0
			? args.roles.map((r) => r.toLowerCase())
			: IN_TASK_ROLES.map((r) => r.toLowerCase()),
	);
	const optOuts: Record<string, boolean> = {
		design: !!args.noDesign,
		architecture: !!args.noArchitecture,
		implement: !!args.noImplement,
		coverage: !!args.noCoverage,
		security: !!args.noSecurity,
	};
	const picked: RoleId[] = [];
	for (const role of IN_TASK_ROLES) {
		if (!explicit.has(role)) continue;
		if (optOuts[role]) continue;
		picked.push(role);
	}
	// Frontend heuristic only governs `design`. If user restricted --role
	// explicitly without `design`, skip it. If `design` is in the set:
	if (picked.includes("design")) {
		const frontend = isFrontendTask(task);
		const wantDesign = args.forceDesign || frontend;
		if (!wantDesign) {
			return picked.filter((r) => r !== "design");
		}
	}
	return picked;
}

/** Resolve which post-commit roles to run, given user flags. */
export function resolvePostRoles(args: { noPostReview?: boolean; noThermoNuclear?: boolean }): RoleId[] {
	const out: RoleId[] = [];
	if (!args.noPostReview) out.push("review");
	if (!args.noThermoNuclear) out.push("thermoNuclear");
	return out;
}
