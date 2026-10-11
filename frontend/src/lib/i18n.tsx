import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "@/locales/en";

/**
 * App-wide language system.
 *
 * Strings live in `src/locales/<lang>/<namespace>.json`, one file per feature.
 * English is the source locale and is bundled eagerly, because it is the
 * fallback for every other language and must be available before first paint.
 * Russian and Uzbek are fetched on demand via dynamic import, so a user who
 * never switches language never downloads them.
 *
 * Why not i18next: the app already had a working table-based translator with
 * this exact `t(key, vars)` signature at ~330 call sites. Swapping the engine
 * would have churned every one of them for behaviour we already have —
 * fallback, interpolation, persistence, plurals and Intl formatting are all
 * below in about a hundred lines. Revisit if we need ICU MessageFormat,
 * gendered strings, or translator tooling that speaks i18next's format.
 *
 * Adding a string: put it in `src/locales/en/<namespace>.json`, use
 * `t("namespace.key")`, then run `npm run i18n:translate` to fill in ru/uz.
 */

export type Lang = "en" | "ru" | "uz";

export const LANGUAGES: Array<{ code: Lang; label: string; english: string }> = [
  { code: "en", label: "English", english: "English" },
  { code: "ru", label: "Русский", english: "Russian" },
  { code: "uz", label: "Oʻzbek", english: "Uzbek" },
];

export const SOURCE_LANG: Lang = "en";

type Table = Record<string, string>;

/** Locales fetched so far. English is present from the first render. */
const loaded: Partial<Record<Lang, Table>> = { en };

/** In-flight fetches, so two components mounting at once share one request. */
const pending: Partial<Record<Lang, Promise<Table>>> = {};

async function loadLang(lang: Lang): Promise<Table> {
  if (loaded[lang]) return loaded[lang]!;
  if (pending[lang]) return pending[lang]!;

  const request = (async () => {
    // Vite turns these into separate chunks, so ru/uz cost nothing until used.
    const mod =
      lang === "ru"
        ? await import("@/locales/ru")
        : await import("@/locales/uz");
    loaded[lang] = mod.default;
    return mod.default;
  })();

  pending[lang] = request;
  try {
    return await request;
  } finally {
    delete pending[lang];
  }
}

// --------------------------------------------------------------------------
// Missing keys
// --------------------------------------------------------------------------

/** Warn once per key. A missing string in a loop must not flood the console. */
const warned = new Set<string>();

function reportMissing(lang: Lang, key: string) {
  if (!import.meta.env.DEV) return;
  const id = `${lang}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  // Loud on purpose. A silent fallback to English is how a half-translated
  // screen ships without anyone noticing.
  console.warn(
    `[i18n] missing "${key}" for "${lang}". ` +
      (lang === SOURCE_LANG
        ? "Add it to src/locales/en/<namespace>.json."
        : "Run `npm run i18n:translate` to fill it in.")
  );
}

/** Every key that fell back during this session. Used by the dev overlay/tests. */
export function missingKeys(): string[] {
  return [...warned];
}

// --------------------------------------------------------------------------
// Formatting
// --------------------------------------------------------------------------

const LOCALE: Record<Lang, string> = { en: "en-GB", ru: "ru-RU", uz: "uz-UZ" };

/** `{name}` / `{n}` placeholders. Values are substituted, never evaluated. */
function interpolate(
  template: string,
  vars?: Record<string, string | number>
): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
    template
  );
}

/**
 * Plural selection.
 *
 * A key may provide `key_one` / `key_few` / `key_many` / `key_other`; the
 * category comes from `Intl.PluralRules`, so Russian gets its three forms and
 * Uzbek its single one without either being hardcoded here. Falls back to the
 * bare key when a translation has not been pluralised.
 */
function pluralKey(table: Table, key: string, count: number, lang: Lang): string {
  const category = new Intl.PluralRules(LOCALE[lang]).select(count);
  for (const candidate of [`${key}_${category}`, `${key}_other`, key]) {
    if (table[candidate] !== undefined) return candidate;
  }
  return key;
}

export function formatNumber(value: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(value);
}

export function formatDate(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(iso: string, lang: Lang): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// --------------------------------------------------------------------------
// Lookup
// --------------------------------------------------------------------------

export interface TranslateOptions extends Record<string, string | number> {}

function lookup(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  const table = loaded[lang] ?? en;
  const count = typeof vars?.count === "number" ? vars.count : undefined;
  const resolved = count !== undefined ? pluralKey(table, key, count, lang) : key;

  const hit = table[resolved];
  if (hit !== undefined) return interpolate(hit, vars);

  // Fall back to English, then to the key itself so a screen never renders
  // blank — but say so in development either way.
  reportMissing(lang, key);
  const fallbackKey = count !== undefined ? pluralKey(en, key, count, SOURCE_LANG) : key;
  const fallback = en[fallbackKey];
  if (fallback !== undefined) return interpolate(fallback, vars);

  if (import.meta.env.DEV) return `⟨${key}⟩`;
  return key;
}

/**
 * Translate for a language other than the active one.
 *
 * Needed where a component must render in the language just chosen, before
 * React has re-rendered with the new context — the Settings confirmation
 * toast, for instance.
 */
export function translateFor(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  return lookup(lang, key, vars);
}

// --------------------------------------------------------------------------
// Persistence and context
// --------------------------------------------------------------------------

const KEY = "medly_lang";

export function readLang(): Lang {
  try {
    const stored = localStorage.getItem(KEY) as Lang | null;
    if (stored && LANGUAGES.some((item) => item.code === stored)) return stored;
  } catch {
    /* private browsing — fall through to the default */
  }
  return SOURCE_LANG;
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** True while a non-English locale is still downloading. */
  loading: boolean;
  formatNumber: (value: number) => string;
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: SOURCE_LANG,
  setLang: () => {},
  t: (key, vars) => lookup(SOURCE_LANG, key, vars),
  loading: false,
  formatNumber: (value) => formatNumber(value, SOURCE_LANG),
  formatDate: (iso) => formatDate(iso, SOURCE_LANG),
  formatDateTime: (iso) => formatDateTime(iso, SOURCE_LANG),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const [, setReady] = useState(0);
  const [loading, setLoading] = useState(false);

  // Fetch the stored language on mount, and any language chosen later. Until
  // it arrives the UI renders English rather than blanking.
  useEffect(() => {
    document.documentElement.lang = lang;
    if (loaded[lang]) return;

    let cancelled = false;
    setLoading(true);
    loadLang(lang)
      .then(() => {
        if (!cancelled) setReady((n) => n + 1);
      })
      .catch((error) => {
        // A failed chunk must not take the app down; English still renders.
        console.error(`[i18n] could not load "${lang}"`, error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private browsing — the choice simply does not persist */
    }
    document.documentElement.lang = next;
    // Warm the cache so the switch is not gated on the render pass.
    void loadLang(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => lookup(lang, key, vars),
    // `loaded` is a module-level cache, so a finished download has to be
    // signalled explicitly for memoised consumers to pick it up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, loading]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      loading,
      formatNumber: (value: number) => formatNumber(value, lang),
      formatDate: (iso: string) => formatDate(iso, lang),
      formatDateTime: (iso: string) => formatDateTime(iso, lang),
    }),
    [lang, setLang, t, loading]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
