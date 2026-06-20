/**
 * security/contract.ts — Markdown report parser/formatter for security
 * findings. The `security` subagent emits findings as a markdown list;
 * we parse + re-format so the human-readable report and the gate input
 * agree.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
	id: string;
	severity: Severity;
	title: string;
	location?: string;
	detail?: string;
}

export function parseSecurityReport(markdown: string): Finding[] {
	const findings: Finding[] = [];
	let counter = 0;
	for (const line of markdown.split(/\r?\n/)) {
		// Accept `- [HIGH] Title` / `- **HIGH** Title` / `- HIGH: Title`
		const m = line.match(/^\s*[\-\*\+]\s+(?:\[[ ]?([A-Za-z]+)[ ]?\]|[\*_]*([A-Za-z]+)[\*_]*[:\s])\s+(.+)$/);
		if (!m) continue;
		const rawSev = (m[1] ?? m[2] ?? "").toLowerCase();
		const sev = normaliseSeverity(rawSev);
		if (!sev) continue;
		const title = (m[3] ?? "").trim();
		if (!title) continue;
		counter++;
		findings.push({ id: `S${String(counter).padStart(3, "0")}`, severity: sev, title });
	}
	return findings;
}

export function normaliseSeverity(raw: string): Severity | undefined {
	const r = raw.toLowerCase();
	if (r === "critical" || r === "crit") return "critical";
	if (r === "high" || r === "h") return "high";
	if (r === "medium" || r === "med" || r === "m") return "medium";
	if (r === "low" || r === "l") return "low";
	if (r === "info" || r === "informational" || r === "i") return "info";
	return undefined;
}

const SEVERITY_SCORE: Record<Severity, number> = {
	info: 0,
	low: 1,
	medium: 2,
	high: 3,
	critical: 4,
};

export function scoreSeverity(findings: Finding[]): { max: Severity; score: number; counts: Record<Severity, number> } {
	const counts: Record<Severity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 };
	let score = 0;
	let max: Severity = "info";
	for (const f of findings) {
		counts[f.severity]++;
		const s = SEVERITY_SCORE[f.severity];
		score += s;
		if (s > SEVERITY_SCORE[max]) max = f.severity;
	}
	return { max, score, counts };
}

export function formatSecurityReport(findings: Finding[]): string {
	const header = ["# Security findings", ""];
	if (findings.length === 0) {
		return header.concat("No findings.").join("\n");
	}
	const scored = scoreSeverity(findings);
	const lines = [...header, `Total: ${findings.length} — max severity: ${scored.max}`, ""];
	for (const f of findings) {
		lines.push(`- [${f.severity.toUpperCase()}] ${f.title}`);
	}
	return lines.join("\n");
}
