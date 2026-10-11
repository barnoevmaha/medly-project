# Translations

English is the source. Russian and Uzbek are derived from it and must never
drift ahead of it.

```
src/locales/
  en/                  source of truth — edit these by hand
    settings.json      one file per feature
    ...
    index.ts           generated barrel, do not edit
  ru/  uz/             translations
    .reviewed.json     which keys a human has actually read
  glossary.json        terminology + tone the translator must follow
```

## Adding a translatable string

1. Put the English in the right namespace, e.g. `en/settings.json`:

   ```json
   { "saveChanges": "Save changes" }
   ```

   Keys are semantic, never the English text: `settings.saveChanges`, not
   `"Save changes"`. Renaming the copy should not churn the key.

2. Use it:

   ```tsx
   const { t } = useLanguage();
   <Button>{t("settings.saveChanges")}</Button>
   ```

3. Fill in the other locales:

   ```bash
   npm run i18n:translate      # needs GEMINI_API_KEY
   ```

4. Read what it produced, fix anything wrong, then record that you read it:

   ```bash
   node scripts/i18n-review.mjs ru settings.saveChanges
   ```

5. `npm run i18n:validate` before you push.

If you add a namespace file, regenerate the barrels (the test suite fails if
they are stale).

## Interpolation

```json
{ "ofStudents": "of {n} students" }
```

```tsx
t("dashboard.ofStudents", { n: profile.total_users })
```

Placeholders must survive translation exactly. The validator fails the build
if a locale adds, drops or renames one — a broken placeholder renders as
literal `{n}` to a user, which is worse than untranslated English.

## Plurals

Suffix the key and pass `count`. Categories come from `Intl.PluralRules`, so
Russian gets `one/few/many/other` and Uzbek `one/other` without either being
hardcoded.

```json
{
  "daysLeft_one":   "{count} день",
  "daysLeft_few":   "{count} дня",
  "daysLeft_many":  "{count} дней"
}
```

```tsx
t("challenges.daysLeft", { count: 3 })
```

## Dates and numbers

Never format by hand — locale conventions differ in ways that are easy to get
wrong (`1,234.5` vs `1 234,5`).

```tsx
const { formatNumber, formatDate, formatDateTime } = useLanguage();
formatNumber(1234)          // 1,234  ·  1 234
formatDate(iso)             // 14 Mar 2026  ·  14 мар. 2026 г.
```

## Missing keys

In development a missing key logs a warning once and renders `⟨key.name⟩` so
it is visible on screen. In production it falls back to English, then to the
key itself — a screen never renders blank.

## Commands

| Command | What it does |
| --- | --- |
| `npm run i18n:validate` | missing, extra, placeholder and plural errors |
| `npm run i18n:check` | validate **and** fail if anything is untranslated — use in CI |
| `npm run i18n:translate` | fill gaps with Gemini; never overwrites existing text |
| `npm run i18n:translate -- --dry-run` | show what would be translated |
| `npm run i18n:review -- --status` | review progress per locale |
| `node scripts/i18n-test.mjs` | behaviour tests |

## Rules the tooling enforces

- **Machine output never overwrites a human.** `i18n-translate` only fills
  keys that are absent. There is deliberately no `--force`; delete the key by
  hand if you want it redone.
- **Reviewed translations are tracked against the English they were reviewed
  against.** If the English later changes, the entry is reported as needing a
  re-read rather than silently kept or silently replaced.
- **Uzbek apostrophes.** `oʻ`/`gʻ` use U+02BB, the glottal stop uses U+02BC.
  The codebase previously mixed five different characters; a test now rejects
  the others.
