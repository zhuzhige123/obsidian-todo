export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options?: {
		cls?: string | string[];
		text?: string;
		attr?: Record<string, string | undefined>;
		parent?: HTMLElement;
	},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (options?.cls) {
		const raw = Array.isArray(options.cls) ? options.cls : [options.cls];
		const list = raw.flatMap((item) => item.split(/\s+/)).filter(Boolean);
		if (list.length) node.classList.add(...list);
	}
	if (options?.text != null) node.textContent = options.text;
	if (options?.attr) {
		for (const [key, value] of Object.entries(options.attr)) {
			if (value != null) node.setAttribute(key, value);
		}
	}
	options?.parent?.appendChild(node);
	return node;
}

export function clearChildren(node: HTMLElement): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}
