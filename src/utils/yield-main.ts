/** Yield to the shared Obsidian main thread between batches of work. */
export function yieldToMainThread(): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, 0);
	});
}
