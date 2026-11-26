/** Local calendar YYYY-MM-DD (vault-facing dates, not UTC). */
export function toLocalDateKey(date: Date = new Date()): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function parseLocalDateKey(key: string): Date {
	const [y, m, d] = key.split("-").map((n) => Number(n));
	return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function formatShortDate(key: string, todayKey: string): string {
	if (key === todayKey) return "今天";
	const date = parseLocalDateKey(key);
	return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Capsule label: `12月21日` or `12月21日 09:30` (never uses “今天” in capsules). */
export function formatDueCapsule(dateKey: string, time: string | null = null): string {
	const date = parseLocalDateKey(dateKey);
	const day = `${date.getMonth() + 1}月${date.getDate()}日`;
	return time ? `${day} ${time}` : day;
}

export function formatMonthTitle(date: Date): string {
	return `${date.getMonth() + 1}月 ${date.getFullYear()}`;
}

/** Normalize loose hour/minute input to HH:mm or null. */
export function normalizeTimeInput(hour: string, minute: string): string | null {
	const h = Number.parseInt(hour, 10);
	const m = Number.parseInt(minute, 10);
	if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDayHeading(key: string): string {
	const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
	const date = parseLocalDateKey(key);
	return `${date.getMonth() + 1}月${date.getDate()}日 · 周${WEEKDAYS[date.getDay()]}`;
}

export function addDays(key: string, delta: number): string {
	const date = parseLocalDateKey(key);
	date.setDate(date.getDate() + delta);
	return toLocalDateKey(date);
}

export function compareDateKeys(a: string | null, b: string | null): number {
	if (!a && !b) return 0;
	if (!a) return 1;
	if (!b) return -1;
	return a < b ? -1 : a > b ? 1 : 0;
}

export function isOverdue(due: string | null, todayKey: string, completed: boolean): boolean {
	if (completed || !due) return false;
	return due < todayKey;
}

/** Monday-start week containing dayKey (local calendar). */
export function startOfWeekMonday(dayKey: string): string {
	const date = parseLocalDateKey(dayKey);
	const day = date.getDay(); // 0 Sun .. 6 Sat
	const offset = day === 0 ? 6 : day - 1;
	date.setDate(date.getDate() - offset);
	return toLocalDateKey(date);
}

/** Whole local days from `fromKey` to `toKey` (can be negative). */
export function daysBetween(fromKey: string, toKey: string): number {
	const from = parseLocalDateKey(fromKey);
	const to = parseLocalDateKey(toKey);
	return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
