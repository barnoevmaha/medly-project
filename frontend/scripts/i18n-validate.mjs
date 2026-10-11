#!/usr/bin/env node
/**
 * Locale validator. Run in CI and before a release.
 *
 *   node scripts/i18n-validate.mjs
 *
 * Checks, in the order a reviewer would:
 *   1. every locale file is valid JSON with flat string values
 *   2. every English key exists in ru and uz          (missing)
 *   3. no locale has keys English does not             (extra / stale)
 *   4. placeholders match the English exactly          (malformed)
 *   5. plural keys are complete for the locale's rules
 *   6. glossary "do not translate" terms survive translation
 *   7. no translation is byte-identical English by accident (a soft warning —
 *      "Premium" legitimately is)
 *
 * Exits non-zero on any error so CI fails. Warnings do not fail the build.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "locales");
const SOURCE = "en";
const TARGETS = ["ru", "uz"];

/** Plural categories Intl actually uses for each locale. */
const PLURAL_FORMS = {
  en: ["one", "other"],
  ru: ["one", "few", "many", "other"],
  uz: ["one", "other"],
};

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readNamespace(lang, ns) {
  const path = join(LOCALES, lang, `${ns}.json`);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      fail(`${lang}/${ns}.json: top level must be an object`);
      return {};
    }
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        fail(`${lang}/${ns}.json: "${key}" is ${typeof value}, expected a string`);
      }
    }
    return parsed;
  } catch (error) {
    fail(`${lang}/${ns}.json: invalid JSON — ${error.message}`);
    return {};
  }
}

/** `{name}` placeholders, as a sorted multiset so duplicates count. */
function placeholders(value) {
  return (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
}

const namespaces = readdirSync(join(LOCALES, SOURCE))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

if (namespaces.length === 0) fail("no English locale files found");

const glossaryPath = join(LOCALES, "glossary.json");
const glossary = existsSync(glossaryPath)
  ? JSON.parse(readFileSync(glossaryPath, "utf8"))
  : { doNotTranslate: [] };

let checked = 0;

for (const ns of namespaces) {
  const source = readNamespace(SOURCE, ns) ?? {};

  for (const lang of TARGETS) {
    const target = readNamespace(lang, ns);
    if (target === null) {
      fail(`${lang}/${ns}.json is missing entirely`);
      continue;
    }

    // 2. missing
    for (const key of Object.keys(source)) {
      if (!(key in target)) fail(`${lang}/${ns}: missing "${key}"`);
    }

    // 3. extra — a key English dropped but a translation kept
    for (const key of Object.keys(target)) {
      if (!(key in source)) {
        // A plural variant is legitimate when the base key exists.
        const base = key.replace(/_(?:zero|one|two|few|many|other)$/, "");
        if (base === key || !(base in source)) {
          fail(`${lang}/${ns}: "${key}" has no English source (stale?)`);
        }
      }
    }

    // 4. placeholders
    for (const [key, english] of Object.entries(source)) {
      const translated = target[key];
      if (typeof translated !== "string") continue;
      checked += 1;

      const want = placeholders(english);
      const got = placeholders(translated);
      if (want.join(",") !== got.join(",")) {
        fail(
          `${lang}/${ns}: "${key}" placeholder mismatch — ` +
            `English has [${want.join(" ")}], ${lang} has [${got.join(" ")}]`
        );
      }

      // 6. protected terms
      for (const term of glossary.doNotTranslate ?? []) {
        if (english.includes(term) && !translated.includes(term)) {
          fail(`${lang}/${ns}: "${key}" dropped the protected term "${term}"`);
        }
      }

      // 7. untranslated
      if (
        translated === english &&
        english.length > 3 &&
        !(glossary.doNotTranslate ?? []).some((t) => english.trim() === t)
      ) {
        warn(`${lang}/${ns}: "${key}" is identical to English — untranslated?`);
      }
    }

    // 5. plural completeness
    const pluralBases = new Set(
      Object.keys(source)
        .filter((k) => /_(?:zero|one|two|few|many|other)$/.test(k))
        .map((k) => k.replace(/_(?:zero|one|two|few|many|other)$/, ""))
    );
    for (const base of pluralBases) {
      for (const form of PLURAL_FORMS[lang]) {
        if (!(`${base}_${form}` in target)) {
          fail(`${lang}/${ns}: plural "${base}" is missing the "${form}" form`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- report

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
console.log(
  `${bold("i18n validate")}  ${namespaces.length} namespaces, ` +
    `${checked} translated strings checked across ${TARGETS.join(" + ")}`
);

for (const w of warnings) console.log(`  \x1b[33mwarn\x1b[0m  ${w}`);
for (const e of errors) console.log(`  \x1b[31merror\x1b[0m ${e}`);

if (errors.length) {
  console.log(`\n${bold("FAILED")}  ${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(1);
}
console.log(`\n${bold("OK")}  no errors${warnings.length ? `, ${warnings.length} warning(s)` : ""}`);
