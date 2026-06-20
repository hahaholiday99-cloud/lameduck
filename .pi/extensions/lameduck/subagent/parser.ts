/**
 * subagent/parser.ts — Parse `pi -p --mode json` stdout into structured events.
 *
 * In `--mode json`, pi emits one JSON event per line. The only event we
 * care about for accounting is `message_end` whose message is an assistant
 * message — we accumulate its `usage` block and remember the trailing text.
 */

import type { TokenUsage } from "../schema/run-state.ts";

export interface ParsedEvents {
	finalText: string;
	usage: TokenUsage;
	model?: string;
	provider?: string;
}

export function emptyUsage(): TokenUsage {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 };
}

export function addUsage(into: TokenUsage, from: Partial<TokenUsage> | undefined): void {
	if (!from) return;
	into.input += from.input ?? 0;
	into.output += from.output ?? 0;
	into.cacheRead += from.cacheRead ?? 0;
	into.cacheWrite += from.cacheWrite ?? 0;
	into.totalTokens += from.totalTokens ?? 0;
	into.cost += from.cost ?? 0;
}

export function parseSubagentEvents(stdout: string): ParsedEvents {
	const out: ParsedEvents = { finalText: "", usage: emptyUsage() };
	if (!stdout) return out;
	for (const raw of stdout.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || !line.startsWith("{")) continue;
		let evt: any;
		try {
			evt = JSON.parse(line);
		} catch {
			continue;
		}
		if (!evt || typeof evt !== "object") continue;
		if (evt.type !== "message_end") continue;
		const msg = evt.message;
		if (!msg || msg.role !== "assistant") continue;
		if (msg.usage) addUsage(out.usage, msg.usage);
		if (typeof msg.model === "string") out.model = msg.model;
		if (typeof msg.provider === "string") out.provider = msg.provider;
		if (Array.isArray(msg.content)) {
			const text = msg.content
				.filter((b: any) => b && b.type === "text" && typeof b.text === "string")
				.map((b: any) => b.text)
				.join("\n");
			if (text.trim().length > 0) out.finalText = text;
		}
	}
	return out;
}

/** Extract `Coverage: NN.N%` from a subagent's final report. */
export function extractCoveragePct(finalText: string): number | undefined {
	if (!finalText) return undefined;
	const m = finalText.match(/^\s*Coverage:\s*(\d{1,3}(?:\.\d+)?)\s*%/im);
	if (!m) return undefined;
	const n = Number(m[1]);
	if (!Number.isFinite(n)) return undefined;
	return n;
}
