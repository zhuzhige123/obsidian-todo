/** Obsidian-native DOM helpers — prefer createEl/createSvg over document.createElement*. */

export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options?: {
		cls?: string | string[];
		text?: string;
		attr?: Record<string, string | undefined>;
		parent?: HTMLElement;
	},
): HTMLElementTagNameMap[K] {
	const attr =
		options?.attr == null
			? undefined
			: Object.fromEntries(
					Object.entries(options.attr).filter(
						(entry): entry is [string, string] => entry[1] != null,
					),
				);

	return createEl(tag, {
		cls: options?.cls,
		text: options?.text,
		attr,
		parent: options?.parent,
	});
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
	tag: K,
	options?: {
		cls?: string | string[];
		attr?: Record<string, string | number | undefined>;
		parent?: Element;
	},
): SVGElementTagNameMap[K] {
	const attr =
		options?.attr == null
			? undefined
			: Object.fromEntries(
					Object.entries(options.attr).filter(
						(entry): entry is [string, string | number] => entry[1] != null,
					),
				);

	return createSvg(tag, {
		cls: options?.cls,
		attr,
		parent: options?.parent,
	});
}

export function clearChildren(node: HTMLElement): void {
	node.empty();
}
