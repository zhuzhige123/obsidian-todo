import { Modal, Setting, type App } from "obsidian";

/** Minimal single-field prompt for creating a subtask title. */
export class TextPromptModal extends Modal {
	private readonly heading: string;
	private readonly placeholder: string;
	private readonly confirmLabel: string;
	private readonly onSubmit: (value: string) => void;
	private value = "";

	constructor(
		app: App,
		options: {
			heading: string;
			placeholder: string;
			confirmLabel: string;
			onSubmit: (value: string) => void;
		},
	) {
		super(app);
		this.heading = options.heading;
		this.placeholder = options.placeholder;
		this.confirmLabel = options.confirmLabel;
		this.onSubmit = options.onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: this.heading });

		new Setting(contentEl).addText((text) => {
			text.setPlaceholder(this.placeholder);
			text.inputEl.addEventListener("keydown", (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					this.submit();
				}
			});
			text.onChange((value) => {
				this.value = value;
			});
			window.setTimeout(() => text.inputEl.focus(), 20);
		});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText(this.confirmLabel);
			btn.setCta();
			btn.onClick(() => this.submit());
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		const next = this.value.trim();
		if (!next) return;
		this.close();
		this.onSubmit(next);
	}
}
