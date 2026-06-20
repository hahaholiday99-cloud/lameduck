/**
 * ui/prompt.ts — RPC-safe user prompts behind a `UiAdapter` port.
 *
 * Adapters:
 *   - PiUiAdapter — wraps `ctx.ui` from the extension runtime (real prompts)
 *   - ScriptedUiAdapter — replays a fixed script of answers (tests)
 *
 * Every method degrades gracefully when `hasUI` is false: the scripted
 * adapter throws on first unscripted call, the pi adapter falls back to
 * safe defaults (Approve→approved, etc.).
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

export interface UiAdapter {
	hasUI(): boolean;
	select(title: string, options: string[]): Promise<string | undefined>;
	confirm(title: string, body?: string): Promise<boolean>;
	input(title: string, placeholder?: string): Promise<string | undefined>;
	notify(message: string, level?: "info" | "warning" | "error"): void;
	setStatus(key: string, text: string): void;
}

export function piUiAdapter(ctx: ExtensionCommandContext): UiAdapter {
	const ui = ctx.ui;
	return {
		hasUI: () => ctx.hasUI,
		async select(title, options) {
			if (!ctx.hasUI) return options[0]; // safe default: first option
			return ui.select(title, options);
		},
		async confirm(title, body) {
			if (!ctx.hasUI) return false; // safe default: reject
			return ui.confirm(title, body ?? "");
		},
		async input(title, placeholder) {
			if (!ctx.hasUI) return undefined;
			return ui.input(title, placeholder);
		},
		notify(message, level = "info") {
			ui.notify(message, level);
		},
		setStatus(key, text) {
			ui.setStatus(key, text);
		},
	};
}

export type ScriptedChoice =
	| { kind: "select"; value: string }
	| { kind: "confirm"; value: boolean }
	| { kind: "input"; value: string };

export function scriptedUiAdapter(script: ScriptedChoice[], hasUI = true): UiAdapter & { log: Array<{ kind: string; title: string; options?: string[] }> } {
	const log: Array<{ kind: string; title: string; options?: string[] }> = [];
	let i = 0;
	const take = (): ScriptedChoice => {
		const next = script[i++];
		if (next === undefined) throw new Error(`scriptedUiAdapter: script exhausted at call #${i}`);
		return next;
	};
	return {
		hasUI: () => hasUI,
		async select(title, options) {
			log.push({ kind: "select", title, options });
			const c = take();
			if (c.kind !== "select") throw new Error(`scriptedUiAdapter: expected select, got ${c.kind}`);
			return c.value;
		},
		async confirm(title, _body) {
			log.push({ kind: "confirm", title });
			const c = take();
			if (c.kind !== "confirm") throw new Error(`scriptedUiAdapter: expected confirm, got ${c.kind}`);
			return c.value;
		},
		async input(title, _placeholder) {
			log.push({ kind: "input", title });
			const c = take();
			if (c.kind !== "input") throw new Error(`scriptedUiAdapter: expected input, got ${c.kind}`);
			return c.value;
		},
		notify(message, level = "info") {
			log.push({ kind: `notify:${level}`, title: message });
		},
		setStatus(_key, text) {
			log.push({ kind: "status", title: text });
		},
		log,
	};
}
