import { getLanguage } from "obsidian";
import {
	CATALOGS,
	LOCALE_IDS,
	type LocaleId,
	type MessageKey,
} from "./messages";

export type { LocaleId, MessageKey, ListGroupMode } from "./messages";
export { LOCALE_IDS, LOCALE_LABELS } from "./messages";

/** Stored preference: follow Obsidian, or a fixed locale. */
export type LocalePreference = "auto" | LocaleId;

export function isLocaleId(value: unknown): value is LocaleId {
	return typeof value === "string" && (LOCALE_IDS as readonly string[]).includes(value);
}

export function isLocalePreference(value: unknown): value is LocalePreference {
	return value === "auto" || isLocaleId(value);
}

/** Map Obsidian `getLanguage()` to a supported plugin locale. */
export function detectLocale(): LocaleId {
	const raw = (getLanguage() || "en").toLowerCase().replace("_", "-");
	if (raw === "zh-tw" || raw.startsWith("zh-hant")) return "zh-TW";
	if (raw === "zh" || raw.startsWith("zh-")) return "zh-CN";
	if (raw.startsWith("ja")) return "ja";
	if (raw.startsWith("ko")) return "ko";
	if (raw.startsWith("ru")) return "ru";
	if (raw.startsWith("es")) return "es";
	if (raw.startsWith("en")) return "en";
	return "en";
}

export function resolveLocale(preference: LocalePreference): LocaleId {
	return preference === "auto" ? detectLocale() : preference;
}

export function t(
	locale: LocaleId,
	key: MessageKey,
	vars?: Record<string, string | number>,
): string {
	const catalog = CATALOGS[locale] ?? CATALOGS.en;
	let text = catalog[key] ?? CATALOGS.en[key] ?? key;
	if (vars) {
		for (const [name, value] of Object.entries(vars)) {
			text = text.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
		}
	}
	return text;
}
