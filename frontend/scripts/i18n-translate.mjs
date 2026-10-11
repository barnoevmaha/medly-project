#!/usr/bin/env node
/**
 * Fill in missing ru/uz translations with Gemini.
 *
 *   node scripts/i18n-translate.mjs            # translate what is missing
 *   node scripts/i18n-translate.mjs --dry-run  # report only, write nothing
 *   node scripts/i18n-translate.mjs --report   # exit 1 if anything is missing
 *
 * This is a development and CI tool. It runs when a developer adds English
 * keys — never on a user request. Rendering the UI does no network work at
 * all; that is the whole point of keeping this out of the runtime.
 *
 * Two rules it will not break:
 *
 *   1. A key that already has a translation is left alone. Machine output must
 *      never overwrite something a human reviewed. `--force` does not exist on
 *      purpose; delete the key by hand if you want it redone.
 *   2. Placeholders survive verbatim. Output whose `{placeholders}` do not
 *      match the English is rejected and the key is left missing, because a
 *      broken placeholder renders as literal braces to a user and a missing
 *      key at least falls back to readable English.
 *
 * Reviewed translations are tracked in `src/locales/<lang>/.reviewed.json`, a
 * map of key -> the English text that was reviewed against. If the English
 * later changes, the entry is reported as stale rather than silently kept.
 *
 * Needs GEMINI_API_KEY (or VIRTUAL_PATIENT_GEMINI_API_KEY) in the environment.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "locales");
const SOURCE = "en";
const TARGETS = ["ru", "uz"];
const LANG_NAME = { ru: "Russian", uz: "Uzbek (Latin script)" };

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const REPORT = args.has("--report");

const MODEL = process.env.I18N_GEMINI_MODEL ?? "gemini-3.5-flash";
const API_KEY = process.env.GEMINI_API_KEY ?? process.env.VIRTUAL_PATIENT_GEMINI_API_KEY ?? "";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
/** Small batches keep one bad string from poisoning a whole namespace. */
const BATCH = 20;

const read = (p, dflt) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : dflt);
const write = (p, data) =>
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
const placeholders = (s) => (s.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(",");

const glossary = read(join(LOCALES, "glossary.json"), { terms: {}, doNotTranslate: [], tone: {} });

// --------------------------------------------------------------------------
// What needs doing
// --------------------------------------------------------------------------

const namespaces = readdirSync(join(LOCALES, SOURCE))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const work = [];   // { lang, ns, key, english }
const stale = [];  // reviewed against English that has since changed

for (const ns of namespaces) {
  const source = read(join(LOCALES, SOURCE, `${ns}.json`), {});
  for (const lang of TARGETS) {
    const target = read(join(LOCALES, lang, `${ns}.json`), {});
    const reviewed = read(join(LOCALES, lang, ".reviewed.json"), {});
    for (const [key, english] of Object.entries(source)) {
      const id = `${ns}.${key}`;
      if (target[key] === undefined) {
        work.push({ lang, ns, key, english });
      } else if (reviewed[id] !== undefined && reviewed[id] !== english) {
        stale.push({ lang, id, was: reviewed[id], now: english });
      }
    }
  }
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
console.log(`${bold("i18n translate")}  ${namespaces.length} namespaces`);

if (stale.length) {
  console.log(`\n  ${bold("English changed since review:")}`);
  for (const s of stale) {
    console.log(`    ${s.lang}/${s.id}`);
    console.log(`      was: "${s.was}"`);
    console.log(`      now: "${s.now}"`);
  }
  console.log(`    Re-check these by hand; they were NOT overwritten.`);
}

if (work.length === 0) {
  console.log(`\n${bold("OK")}  every key is translated${stale.length ? `, ${stale.length} to re-check` : ""}`);
  process.exit(stale.length && REPORT ? 1 : 0);
}

const byLang = {};
for (const item of work) (byLang[item.lang] ??= []).push(item);
console.log(
  `\n  missing: ` +
    Object.entries(byLang).map(([l, items]) => `${l}=${items.length}`).join("  ")
);
for (const item of work.slice(0, 10)) {
  console.log(`    ${item.lang}/${item.ns}.${item.key}  "${item.english.slice(0, 52)}"`);
}
if (work.length > 10) console.log(`    …and ${work.length - 10} more`);

if (REPORT) {
  console.log(`\n${bold("FAILED")}  ${work.length} untranslated key(s). Run \`npm run i18n:translate\`.`);
  process.exit(1);
}
if (DRY) {
  console.log(`\n${bold("DRY RUN")}  nothing written`);
  process.exit(0);
}
if (!API_KEY) {
  console.error(
    `\n${bold("No API key.")} Set GEMINI_API_KEY to translate. ` +
      `Use --dry-run or --report to inspect without one.`
  );
  process.exit(1);
}

// --------------------------------------------------------------------------
// Translate
// --------------------------------------------------------------------------

function systemPrompt(lang) {
  const terms = Object.entries(glossary.terms ?? {})
    .map(([en, v]) => `  ${en} -> ${v[lang]}`)
    .join("\n");
  return `You translate user-interface strings for Medly, a medical education \
platform for medical students and doctors. Translate from English into \
${LANG_NAME[lang]}.

This is product UI, not prose. Translate the intent, not the words. A button \
labelled "Save changes" becomes whatever a native ${LANG_NAME[lang]} product \
would put on that button, at a similar length — UI copy that runs twice as \
long as the English breaks the layout.

TERMINOLOGY — use these renderings exactly, every time:
${terms}

NEVER TRANSLATE these; copy them through unchanged:
${(glossary.doNotTranslate ?? []).join(", ")}

TONE
${glossary.tone?.[lang] ?? ""}

PLACEHOLDERS
Text may contain placeholders like {name}, {n} or {count}. Reproduce every \
placeholder exactly as written, including the braces and the spelling inside \
them. Never translate, reorder into a different placeholder, add or drop one. \
You may move a placeholder within the sentence if the grammar requires it.

Clinical terms must use the vocabulary taught in ${LANG_NAME[lang]}-language \
medical faculties. Do not invent terminology.

Return ONLY a JSON object mapping each input key to its translation. No \
commentary, no code fence.`;
}

async function translateBatch(lang, items) {
  const payload = Object.fromEntries(
    items.map((i) => [`${i.ns}.${i.key}`, i.english])
  );
  const context = items
    .filter((i) => i.english.length < 30)
    .map((i) => `  ${i.ns}.${i.key} appears in the "${i.ns}" screen`)
    .slice(0, 8)
    .join("\n");

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(lang) }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              (context ? `Context for short strings:\n${context}\n\n` : "") +
              `Translate these into ${LANG_NAME[lang]}:\n` +
              JSON.stringify(payload, null, 2),
          },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  };

  const response = await fetch(`${ENDPOINT}/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const json = await response.json();
  const text = (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(text);
}

let written = 0;
let rejected = 0;

for (const [lang, items] of Object.entries(byLang)) {
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    process.stdout.write(`  ${lang}: ${i + 1}–${i + batch.length} of ${items.length}… `);

    let out;
    try {
      out = await translateBatch(lang, batch);
    } catch (error) {
      console.log(`\x1b[31mfailed\x1b[0m — ${error.message}`);
      continue;
    }

    const perNamespace = {};
    for (const item of batch) {
      const value = out[`${item.ns}.${item.key}`];
      if (typeof value !== "string" || !value.trim()) {
        rejected += 1;
        continue;
      }
      // Rule 2: a placeholder mismatch is rejected, not written.
      if (placeholders(value) !== placeholders(item.english)) {
        console.log(
          `\n    \x1b[31mrejected\x1b[0m ${item.ns}.${item.key} — placeholders changed`
        );
        rejected += 1;
        continue;
      }
      (perNamespace[item.ns] ??= {})[item.key] = value;
    }

    for (const [ns, entries] of Object.entries(perNamespace)) {
      const path = join(LOCALES, lang, `${ns}.json`);
      const current = read(path, {});
      // Rule 1: only ever fill gaps.
      for (const [key, value] of Object.entries(entries)) {
        if (current[key] === undefined) {
          current[key] = value;
          written += 1;
        }
      }
      write(path, Object.fromEntries(Object.entries(current).sort()));
    }
    console.log("done");
  }
}

console.log(
  `\n${bold("Wrote")} ${written} translation(s)` +
    (rejected ? `, ${bold("rejected")} ${rejected}` : "")
);
console.log(
  `Machine output is unreviewed. Read it, fix what is wrong, then record it:\n` +
    `  node scripts/i18n-review.mjs <lang> <namespace.key>...`
);
console.log(`Then run: node scripts/i18n-validate.mjs`);
