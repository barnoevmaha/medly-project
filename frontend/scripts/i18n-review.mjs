#!/usr/bin/env node
/**
 * Mark translations as human-reviewed.
 *
 *   node scripts/i18n-review.mjs ru settings.saveChanges nav.library
 *   node scripts/i18n-review.mjs ru --all          # whole locale, use sparingly
 *   node scripts/i18n-review.mjs --status          # what still needs reading
 *
 * Records the English text each translation was reviewed against in
 * `src/locales/<lang>/.reviewed.json`. That snapshot is what lets
 * `i18n-translate.mjs` tell "nobody has looked at this yet" apart from
 * "somebody approved this, and the English has since changed" — the second
 * needs a human, the first can be machine-filled.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "locales");
const SOURCE = "en";
const TARGETS = ["ru", "uz"];

const read = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : d);
const write = (p, o) => writeFileSync(p, JSON.stringify(o, null, 2) + "\n", "utf8");
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const namespaces = readdirSync(join(LOCALES, SOURCE))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const english = {};
for (const ns of namespaces) {
  for (const [k, v] of Object.entries(read(join(LOCALES, SOURCE, `${ns}.json`), {}))) {
    english[`${ns}.${k}`] = v;
  }
}

const argv = process.argv.slice(2);

if (argv.includes("--status") || argv.length === 0) {
  console.log(`${bold("i18n review status")}`);
  for (const lang of TARGETS) {
    const reviewed = read(join(LOCALES, lang, ".reviewed.json"), {});
    const translated = Object.keys(english).filter((id) => {
      const [ns, ...rest] = id.split(".");
      return read(join(LOCALES, lang, `${ns}.json`), {})[rest.join(".")] !== undefined;
    });
    const done = translated.filter((id) => reviewed[id] === english[id]).length;
    const drifted = translated.filter(
      (id) => reviewed[id] !== undefined && reviewed[id] !== english[id]
    ).length;
    const bar = "█".repeat(Math.round((done / translated.length) * 24)).padEnd(24, "░");
    console.log(
      `  ${lang}  ${bar}  ${done}/${translated.length} reviewed` +
        (drifted ? `, ${drifted} need re-checking` : "")
    );
  }
  console.log(`\n  Mark reviewed:  node scripts/i18n-review.mjs <lang> <key>...`);
  process.exit(0);
}

const [lang, ...keys] = argv;
if (!TARGETS.includes(lang)) {
  console.error(`Unknown locale "${lang}". Expected one of: ${TARGETS.join(", ")}`);
  process.exit(1);
}

const reviewedPath = join(LOCALES, lang, ".reviewed.json");
const reviewed = read(reviewedPath, {});
const wanted = keys.includes("--all") ? Object.keys(english) : keys;

let marked = 0;
let skipped = 0;
for (const id of wanted) {
  if (english[id] === undefined) {
    console.log(`  \x1b[33mskip\x1b[0m  ${id} — no such English key`);
    skipped += 1;
    continue;
  }
  const [ns, ...rest] = id.split(".");
  const translation = read(join(LOCALES, lang, `${ns}.json`), {})[rest.join(".")];
  if (translation === undefined) {
    console.log(`  \x1b[33mskip\x1b[0m  ${id} — not translated into ${lang} yet`);
    skipped += 1;
    continue;
  }
  reviewed[id] = english[id];
  marked += 1;
}

write(reviewedPath, Object.fromEntries(Object.entries(reviewed).sort()));
console.log(
  `${bold("Marked")} ${marked} key(s) reviewed for ${lang}` +
    (skipped ? `, ${skipped} skipped` : "")
);
