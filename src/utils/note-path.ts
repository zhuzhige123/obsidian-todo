/** Vault-relative note path helpers for list UI (no file-extension chrome). */

export function normalizeVaultPath(path: string): string {
	return path.replace(/\\/g, "/");
}

/** Last path segment without a trailing `.md` (case-insensitive). */
export function noteDisplayName(path: string): string {
	const normalized = normalizeVaultPath(path);
	const base = normalized.split("/").filter(Boolean).pop() ?? normalized;
	return base.replace(/\.md$/i, "");
}

/** Short breadcrumb for non-grouped rows: last 1–2 segments, `.md` stripped. */
export function shortNoteLabel(path: string): string {
	const parts = normalizeVaultPath(path).split("/").filter(Boolean);
	const trimmed = parts.map((part, index) =>
		index === parts.length - 1 ? part.replace(/\.md$/i, "") : part,
	);
	if (trimmed.length <= 2) return trimmed.join("/");
	return trimmed.slice(-2).join("/");
}

/** Strip leading `#` for on-screen tag capsules. */
export function tagChipLabel(rawTag: string): string {
	return rawTag.replace(/^#/, "");
}
