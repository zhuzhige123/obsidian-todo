/** Stable soft-color slots for tag capsules (Morandi-like, light + dark in CSS). */
export const TAG_COLOR_SLOT_COUNT = 8;

/**
 * FNV-1a style hash → fixed palette index.
 * Same tag text always maps to the same slot; slots cycle after 8.
 */
export function tagColorSlot(key: string): number {
	const normalized = key.trim().replace(/^#/, "").toLowerCase();
	if (!normalized) return 0;
	let hash = 2166136261;
	for (let i = 0; i < normalized.length; i++) {
		hash ^= normalized.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % TAG_COLOR_SLOT_COUNT;
}
