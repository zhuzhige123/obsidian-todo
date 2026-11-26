import { TASK_MAX_DEPTH } from "../constants";
import type { ParsedTask, TaskPriority } from "../types";

const TASK_LINE_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Tasks date fields may include one or two times (space or dash separated). */
const DATE_TOKEN = String.raw`\d{4}-\d{2}-\d{2}(?:\s*[T]?\s*\d{1,2}:\d{2}(?::\d{2})?){0,2}`;

const DUE_RE = new RegExp(String.raw`📅\s*(${DATE_TOKEN})`);
const SCHEDULED_RE = new RegExp(String.raw`⏳\s*(${DATE_TOKEN})`);
const CREATED_RE = new RegExp(String.raw`➕\s*(${DATE_TOKEN})`);
const DONE_RE = new RegExp(String.raw`✅\s*(${DATE_TOKEN})`);
const RECURRING_RE = /🔁/;
const TAG_RE = /#([^\s#]+)/g;
/** Obsidian wiki image embed: `![[file.png]]` / `![[file.png|100]]` */
const WIKI_EMBED_RE = /!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;
/** Standard markdown image: `![alt](path)` */
const MD_IMAGE_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

const PRIORITY_MARKERS: Array<{ marker: string; priority: TaskPriority }> = [
	{ marker: "🔺", priority: "highest" },
	{ marker: "⏫", priority: "high" },
	{ marker: "🔼", priority: "medium" },
	{ marker: "🔽", priority: "low" },
	{ marker: "⏬", priority: "lowest" },
];

/** Strip Tasks plugin fields from the visible title. */
const STRIP_MARKERS_RE = new RegExp(
	[
		String.raw`🔁\s*[^📅⏳➕✅🛫🔺⏫🔼🔽⏬#\n]*`,
		String.raw`[📅⏳➕✅🛫]\s*${DATE_TOKEN}`,
		String.raw`[🔺⏫🔼🔽⏬]`,
		String.raw`(?:^|\s)(?:id|blockId|dependsOn|onCompletion|created|scheduled|due|start|done)::\S+`,
	].join("|"),
	"giu",
);

function toDateKey(token: string | undefined): string | null {
	if (!token) return null;
	const m = token.match(/(\d{4}-\d{2}-\d{2})/);
	return m?.[1] ?? null;
}

/** First HH:mm after the calendar date in a Tasks date token. */
function toTimeKey(token: string | undefined): string | null {
	if (!token) return null;
	const m = token.match(/\d{4}-\d{2}-\d{2}(?:[T ]+|[\s-]+)(\d{1,2}):(\d{2})/);
	if (!m?.[1] || !m[2]) return null;
	const h = Number.parseInt(m[1], 10);
	const min = Number.parseInt(m[2], 10);
	if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function fingerprint(
	path: string,
	line: number,
	title: string,
	due: string | null,
	scheduled: string | null,
): string {
	return `${path}::${line}::${title}::${due ?? ""}::${scheduled ?? ""}`;
}

/** Count leading indent; tabs count as 2 spaces (common Obsidian default). */
export function measureIndent(prefix: string): number {
	let width = 0;
	for (const ch of prefix) {
		width += ch === "\t" ? 2 : 1;
	}
	return width;
}

function extractImages(body: string): { images: string[]; without: string } {
	const images: string[] = [];
	let without = body.replace(WIKI_EMBED_RE, (_full, target: string) => {
		const path = target.trim();
		if (path) images.push(path);
		return " ";
	});
	without = without.replace(MD_IMAGE_RE, (_full, _alt: string, target: string) => {
		const path = target.trim();
		if (path) images.push(path);
		return " ";
	});
	return { images, without };
}

function stripMarkers(body: string): string {
	return body
		.replace(STRIP_MARKERS_RE, " ")
		.replace(TAG_RE, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parsePriority(body: string): TaskPriority {
	for (const item of PRIORITY_MARKERS) {
		if (body.includes(item.marker)) return item.priority;
	}
	return null;
}

function parseTags(body: string): string[] {
	const tags: string[] = [];
	TAG_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG_RE.exec(body)) !== null) {
		tags.push(`#${match[1]}`);
	}
	return tags;
}

export function parseTaskLine(path: string, line: number, raw: string): ParsedTask | null {
	const matched = raw.match(TASK_LINE_RE);
	if (!matched) return null;

	const indent = measureIndent(matched[1] ?? "");
	const completed = matched[2].toLowerCase() === "x";
	const body = matched[3] ?? "";
	const dueToken = body.match(DUE_RE)?.[1];
	const due = toDateKey(dueToken);
	const dueTime = toTimeKey(dueToken);
	const scheduled = toDateKey(body.match(SCHEDULED_RE)?.[1]);
	const created = toDateKey(body.match(CREATED_RE)?.[1]);
	const doneDate = toDateKey(body.match(DONE_RE)?.[1]);
	const { images, without: bodyWithoutImages } = extractImages(body);
	const title = stripMarkers(bodyWithoutImages);
	if (!title) return null;

	return {
		id: fingerprint(path, line, title, due, scheduled),
		path,
		line,
		raw,
		indent,
		depth: 0,
		parentId: null,
		childIds: [],
		completed,
		title,
		due,
		dueTime,
		scheduled,
		created,
		doneDate,
		priority: parsePriority(body),
		recurring: RECURRING_RE.test(body),
		hasDescription: false,
		images,
		tags: parseTags(body),
	};
}

/** Wire parent/child from indent stack within one file (document order). */
export function linkTaskTree(tasks: ParsedTask[]): void {
	const stack: ParsedTask[] = [];
	for (const task of tasks) {
		task.parentId = null;
		task.childIds = [];
		task.depth = 0;
		while (stack.length > 0) {
			const top = stack[stack.length - 1];
			if (!top || top.indent < task.indent) break;
			stack.pop();
		}
		const parent = stack[stack.length - 1];
		if (parent) {
			task.parentId = parent.id;
			parent.childIds.push(task.id);
			task.depth = Math.min(TASK_MAX_DEPTH, parent.depth + 1);
		}
		stack.push(task);
	}
}

export function parseTasksInMarkdown(path: string, content: string): ParsedTask[] {
	const lines = content.split(/\r?\n/);
	const tasks: ParsedTask[] = [];
	for (let i = 0; i < lines.length; i++) {
		const task = parseTaskLine(path, i, lines[i] ?? "");
		if (task) tasks.push(task);
	}
	linkTaskTree(tasks);
	return tasks;
}

/** Toggle checkbox in a raw line; preserve remaining markers. */
export function toggleTaskLineCompleted(raw: string, completed: boolean): string {
	return raw.replace(
		/^(\s*[-*+]\s+)\[([ xX])\]/,
		(`$1[${completed ? "x" : " "}]`),
	);
}

/** Indent prefix for a child one step deeper than parent (2 spaces). */
export function childIndentPrefix(parentRaw: string): string {
	const matched = parentRaw.match(/^(\s*)/);
	const base = matched?.[1] ?? "";
	return `${base}  `;
}

/** Leading whitespace of a raw markdown line. */
export function lineIndentPrefix(raw: string): string {
	return raw.match(/^(\s*)/)?.[1] ?? "";
}

/**
 * Shift leading indent by `deltaSpaces` (can be negative).
 * Tabs are expanded as 2 spaces before rewriting as spaces.
 */
export function shiftLineIndent(raw: string, deltaSpaces: number): string {
	const matched = raw.match(/^(\s*)(.*)$/);
	if (!matched) return raw;
	const nextWidth = Math.max(0, measureIndent(matched[1] ?? "") + deltaSpaces);
	return `${" ".repeat(nextWidth)}${matched[2] ?? ""}`;
}

/** Build a new incomplete task line with optional due date / time. */
export function buildTaskMarkdownLine(
	indentPrefix: string,
	title: string,
	due: string | null = null,
	dueTime: string | null = null,
): string {
	let body = title.trim();
	if (due) {
		body += dueTime ? ` 📅 ${due} ${dueTime}` : ` 📅 ${due}`;
	}
	return `${indentPrefix}- [ ] ${body}`;
}

/** Replace or remove the 📅 due field on a raw task line. */
export function applyDueToTaskLine(
	raw: string,
	due: string | null,
	dueTime: string | null = null,
): string {
	const without = raw.replace(new RegExp(String.raw`\s*📅\s*${DATE_TOKEN}`), "");
	if (!due) return without.trimEnd();
	const token = dueTime ? `${due} ${dueTime}` : due;
	return `${without.trimEnd()} 📅 ${token}`;
}
