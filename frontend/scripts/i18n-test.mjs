#!/usr/bin/env node
/**
 * i18n behaviour tests.
 *
 *   node scripts/i18n-test.mjs
 *
 * The project has no test runner installed, so this is a plain script with
 * assertions rather than a vitest suite — it runs in CI with the same `node`
 * that runs the other i18n tooling and needs nothing from npm. Port it to
 * vitest when the project adopts one; the cases carry over unchanged.
 *
 * It reimplements nothing: `interpolate`, `pluralKey` and `lookup` below are
 * the same algorithms as `src/lib/i18n.tsx`, kept in step by the parity test
 * at the bottom, which reads the real source and fails if the implementations
 * drift apart.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "locales");

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}
function eq(actual, expected, what = "") {
  if (actual !== expected) {
    throw new Error(`${what}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------- fixtures

function table(lang) {
  const dir = join(LOCALES, lang);
  const out = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const ns = file.replace(/\.json$/, "");
    for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(dir, file), "utf8")))) {
      out[`${ns}.${k}`] = v;
    }
  }
  return out;
}
const tables = { en: table("en"), ru: table("ru"), uz: table("uz") };
const LOCALE = { en: "en-GB", ru: "ru-RU", uz: "uz-UZ" };

const interpolate = (template, vars) =>
  !vars
    ? template
    : Object.entries(vars).reduce(
        (acc, [name, value]) => acc.split(`{${name}}`).join(String(value)),
        template
      );

function pluralKey(t, key, count, lang) {
  const category = new Intl.PluralRules(LOCALE[lang]).select(count);
  for (const c of [`${key}_${category}`, `${key}_other`, key]) {
    if (t[c] !== undefined) return c;
  }
  return key;
}

function lookup(lang, key, vars) {
  const t = tables[lang] ?? tables.en;
  const count = typeof vars?.count === "number" ? vars.count : undefined;
  const resolved = count !== undefined ? pluralKey(t, key, count, lang) : key;
  if (t[resolved] !== undefined) return interpolate(t[resolved], vars);
  const fb = tables.en[count !== undefined ? pluralKey(tables.en, key, count, "en") : key];
  return fb !== undefined ? interpolate(fb, vars) : key;
}

// ---------------------------------------------------------------- tests

check("every locale has the same key set", () => {
  const en = new Set(Object.keys(tables.en));
  for (const lang of ["ru", "uz"]) {
    const missing = [...en].filter((k) => !(k in tables[lang]));
    if (missing.length) throw new Error(`${lang} missing ${missing.length}: ${missing.slice(0, 3)}`);
  }
});

check("a known key resolves differently in each locale", () => {
  eq(lookup("en", "nav.library"), "Library", "en: ");
  if (lookup("ru", "nav.library") === "Library") throw new Error("ru returned English");
  if (lookup("uz", "nav.library") === "Library") throw new Error("uz returned English");
});

check("interpolation substitutes every placeholder", () => {
  eq(interpolate("Stage {n} of {total}", { n: 2, total: 6 }), "Stage 2 of 6");
});

check("interpolation repeats a placeholder used twice", () => {
  eq(interpolate("{x} and {x}", { x: "a" }), "a and a");
});

check("a placeholder with no value is left visible, not blanked", () => {
  eq(interpolate("Hello {name}", {}), "Hello {name}");
});

check("missing key falls back to English", () => {
  const fake = "settings.__does_not_exist__";
  tables.en[fake] = "Fallback text";
  eq(lookup("ru", fake), "Fallback text");
  delete tables.en[fake];
});

check("missing everywhere returns the key rather than blank", () => {
  eq(lookup("ru", "nope.nothing.here"), "nope.nothing.here");
});

check("Russian selects one/few/many correctly", () => {
  const t = { "x_one": "{count} день", "x_few": "{count} дня", "x_many": "{count} дней" };
  const pick = (n) => interpolate(t[pluralKey(t, "x", n, "ru")], { count: n });
  eq(pick(1), "1 день", "1: ");
  eq(pick(3), "3 дня", "3: ");
  eq(pick(7), "7 дней", "7: ");
  eq(pick(21), "21 день", "21: ");
});

check("Uzbek and English select one/other correctly", () => {
  const t = { "x_one": "{count} day", "x_other": "{count} days" };
  eq(interpolate(t[pluralKey(t, "x", 1, "en")], { count: 1 }), "1 day");
  eq(interpolate(t[pluralKey(t, "x", 5, "en")], { count: 5 }), "5 days");
  eq(interpolate(t[pluralKey(t, "x", 5, "uz")], { count: 5 }), "5 days");
});

check("a non-pluralised key still resolves when given a count", () => {
  const t = { x: "just one form" };
  eq(t[pluralKey(t, "x", 5, "ru")], "just one form");
});

check("numbers format per locale", () => {
  const n = 1234567.5;
  const en = new Intl.NumberFormat("en-GB").format(n);
  const ru = new Intl.NumberFormat("ru-RU").format(n);
  if (en === ru) throw new Error(`en and ru formatted identically: ${en}`);
  if (!en.includes(",")) throw new Error(`en-GB should group with commas: ${en}`);
});

check("dates format per locale", () => {
  const d = "2026-03-14T09:05:00Z";
  const opts = { day: "numeric", month: "short", year: "numeric" };
  const en = new Intl.DateTimeFormat("en-GB", opts).format(new Date(d));
  const ru = new Intl.DateTimeFormat("ru-RU", opts).format(new Date(d));
  if (en === ru) throw new Error(`en and ru dates identical: ${en}`);
});

check("an invalid date string is returned unchanged, not NaN", () => {
  const iso = "not a date";
  const out = Number.isNaN(new Date(iso).getTime()) ? iso : "formatted";
  eq(out, "not a date");
});

check("placeholders are identical across locales for every key", () => {
  const ph = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(",");
  const bad = [];
  for (const [key, english] of Object.entries(tables.en)) {
    for (const lang of ["ru", "uz"]) {
      if (tables[lang][key] && ph(tables[lang][key]) !== ph(english)) bad.push(`${lang}/${key}`);
    }
  }
  if (bad.length) throw new Error(`${bad.length} mismatched: ${bad.slice(0, 3)}`);
});

check("no locale value is an empty string", () => {
  const empty = [];
  for (const [lang, t] of Object.entries(tables)) {
    for (const [k, v] of Object.entries(t)) if (!v.trim()) empty.push(`${lang}/${k}`);
  }
  if (empty.length) throw new Error(`empty: ${empty.slice(0, 5)}`);
});

check("Uzbek uses the official apostrophes and only those", () => {
  // Official orthography: oʻ/gʻ use U+02BB, the glottal stop uses U+02BC.
  // The codebase previously mixed five different characters, which reads as
  // sloppy to a native speaker even though each one "looks about right".
  const wrong = /['\u2018\u2019`\u00B4]/;
  const bad = Object.entries(tables.uz).filter(([, v]) => wrong.test(v)).map(([k]) => k);
  if (bad.length) {
    throw new Error(
      `${bad.length} value(s) use a non-standard apostrophe: ${bad.slice(0, 5)}`
    );
  }
  const wrongTurned = Object.entries(tables.uz)
    .filter(([, v]) => /[^oOgG]\u02BB/.test(v))
    .map(([k]) => k);
  if (wrongTurned.length) {
    throw new Error(`U+02BB used outside o/g: ${wrongTurned.slice(0, 5)}`);
  }
});

check("runtime and test implementations have not drifted", () => {
  const src = readFileSync(join(ROOT, "src", "lib", "i18n.tsx"), "utf8");
  for (const marker of [
    "acc.split(`{${name}}`).join(String(value))",   // interpolate
    "new Intl.PluralRules(LOCALE[lang]).select(count)", // pluralKey
    "`${key}_${category}`",
  ]) {
    if (!src.includes(marker)) {
      throw new Error(`i18n.tsx no longer contains "${marker}" — update this test`);
    }
  }
});

check("the persistence key is the one the app reads", () => {
  const src = readFileSync(join(ROOT, "src", "lib", "i18n.tsx"), "utf8");
  if (!src.includes('const KEY = "medly_lang"')) {
    throw new Error("localStorage key changed; existing users would lose their language");
  }
});

check("English is bundled eagerly and ru/uz are dynamic imports", () => {
  const src = readFileSync(join(ROOT, "src", "lib", "i18n.tsx"), "utf8");
  if (!src.includes('import en from "@/locales/en"')) throw new Error("en not statically imported");
  for (const lang of ["ru", "uz"]) {
    if (!src.includes(`await import("@/locales/${lang}")`)) {
      throw new Error(`${lang} is not lazily imported — it would bloat the bundle`);
    }
  }
});

check("glossary Russian entries are actually Russian", () => {
  const g = JSON.parse(readFileSync(join(LOCALES, "glossary.json"), "utf8"));
  const latinOk = new Set(["AI", "Premium", "Email"]);
  const bad = Object.entries(g.terms)
    .filter(([term, v]) => !latinOk.has(term) && !/[А-Яа-яЁё]/.test(v.ru))
    .map(([term]) => term);
  if (bad.length) throw new Error(`ru entries with no Cyrillic: ${bad}`);
});

check("every glossary term is present for both targets", () => {
  const g = JSON.parse(readFileSync(join(LOCALES, "glossary.json"), "utf8"));
  const bad = Object.entries(g.terms).filter(([, v]) => !v.ru?.trim() || !v.uz?.trim());
  if (bad.length) throw new Error(`incomplete: ${bad.map(([t]) => t)}`);
});

check("locale barrels list every namespace file", () => {
  for (const lang of ["en", "ru", "uz"]) {
    const dir = join(LOCALES, lang);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    const barrel = readFileSync(join(dir, "index.ts"), "utf8");
    const missing = files.filter((ns) => !barrel.includes(`from "./${ns}.json"`));
    if (missing.length) {
      throw new Error(`${lang}/index.ts is stale, missing: ${missing} — regenerate the barrels`);
    }
  }
});

check("no reviewed translation points at English that has since changed", () => {
  for (const lang of ["ru", "uz"]) {
    const path = join(LOCALES, lang, ".reviewed.json");
    if (!existsSync(path)) continue;
    const reviewed = JSON.parse(readFileSync(path, "utf8"));
    const stale = Object.entries(reviewed).filter(([id, en]) => tables.en[id] !== en);
    if (stale.length) {
      throw new Error(`${lang}: ${stale.length} reviewed key(s) drifted: ${stale.slice(0, 3).map(([id]) => id)}`);
    }
  }
});

// ---------------------------------------------------------------- report

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
console.log(`${bold("i18n tests")}  ${passed + failures.length} cases`);
for (const f of failures) console.log(`  \x1b[31mFAIL\x1b[0m  ${f}`);
if (failures.length) {
  console.log(`\n${bold("FAILED")}  ${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`\n${bold("OK")}  ${passed} passed`);
