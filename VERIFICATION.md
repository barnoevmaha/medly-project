# Verification checklist

Run this before the demo. Two commands, then the walkthrough.

```bash
# 1 — the whole stack, seeded on boot
docker compose up --build          # API :8000, web :5173

# 2 — the API test suite
cd backend && python -m pytest -q
```

Sign in with `student@medly.dev` (free), `premium@medly.dev` (Premium) or
`instructor@medly.dev` (teacher). Password `medly1234` for all of them.

> **Honest note.** The frontend typechecks clean under `tsc --strict`, and the
> Python is syntax- and import-checked, but the backend test suite and the Vite
> production build have not been executed in this environment — no package
> index was reachable from it. Run both commands above once before you present.

> **If every page says "Could not validate credentials":** the API is rejecting
> your token. Almost always `MEDLY_SECRET_KEY` is unset, so the container
> generates a new one on each deploy and invalidates every token ever issued.
> Pin it to a fixed value (`openssl rand -hex 32`), confirm the SQLite volume is
> mounted at `/app/data` so users survive a restart, and check the web service's
> `MEDLY_API_URL` points at the API's public domain. The client now clears the
> token and returns you to sign-in on a 401 rather than showing the raw error.

---

## Articles and the feed

| | Check | Where |
|---|---|---|
| ☐ | Clicking an article opens the expanded article | `/dashboard` → any card title → `/feed/:slug` |
| ☐ | The article body is substantially longer than the card | Article page — full markdown, 5–7 min read |
| ☐ | Comment button navigates to the comment section | Card comment icon → article opens at `#comments`, composer focused |
| ☐ | Save works and persists | Save on a card → refresh → still saved → appears in `/saved` |
| ☐ | Share copies the real article URL | Share → toast "Link copied" → clipboard holds `…/feed/<slug>` |
| ☐ | Feed search covers article content, not only titles | Search `radiologists` — matches an article whose title lacks the word |

Search runs server-side (`GET /api/feed/articles?q=`) across title, excerpt,
body, author and tag, case-insensitively.

## Communities

| | Check | Where |
|---|---|---|
| ☐ | Premium users can create communities | Sign in as `premium@medly.dev` → Create Community |
| ☐ | Non-premium users cannot | As `student@medly.dev` the button is replaced by a Premium prompt |
| ☐ | The block is not frontend-only | `curl -X POST /api/communities` with a student token → **403** |
| ☐ | Clicking a community opens its chat | `/community` → Open chat → messages, members, composer |
| ☐ | Community search matches title + description only | Search `door-to-needle` (a chat message) → no results |

## Challenges, points and rank

| | Check | Where |
|---|---|---|
| ☐ | Join opens the actual challenge | `/challenges` → Join → question runner, not a toggled button |
| ☐ | Questions match the challenge topic | "AI in Medical Imaging" → model behaviour, saliency, 510(k), automation bias |
| ☐ | Correct answers award points | Answer correctly → "+N points" badge and toast |
| ☐ | Points persist | Refresh → the score on `/profile` is unchanged |
| ☐ | Points cannot be farmed | Re-answer the same question → "already answered", 0 points |
| ☐ | Rank reflects points | `/leaderboard` — ordered by points, your row highlighted |

## Navigation and Settings

| | Check | Where |
|---|---|---|
| ☐ | Student nav is five items | Dashboard · Communities · Challenges · Library · Profile |
| ☐ | Sidebar footer order | Go Premium → Settings → Log out |
| ☐ | Teaching tools are role-gated | AI Training · Case references · Governance appear only for instructor/admin |
| ☐ | Settings exists and is reachable from the navbar | Sidebar → Settings → `/settings` |
| ☐ | Settings actually works | Rename yourself, change your password, toggle dark mode |
| ☐ | Nothing on the page is decorative | Every control hits an endpoint or a stored preference |
| ☐ | Mobile reaches everything | Bottom bar → More → the rest, plus Saved and Log out |
| ☐ | Your Feed has its own page | `/feed` — full search and filters; the Dashboard shows a preview of the same component |

Settings covers Account (name, institution, year — `PATCH /api/auth/me`),
Security (password change, current password required), Privacy (leaderboard
visibility, delete assistant history), Appearance (light/dark/system, reduce
motion), Notifications (confirmation toasts) and Session (log out). Role,
points and Premium are deliberately not editable there.

## Library and Saved — separate sections

| | Check | Where |
|---|---|---|
| ☐ | Library still exists and is in the navbar | Sidebar → Library → `/library` |
| ☐ | PDFs still exist inside Library | Library → PDFs tile |
| ☐ | Books still exist inside Library | Library → Books tile |
| ☐ | Videos still exist inside Library | Library → Videos tile |
| ☐ | Resources open | Library → Open → detail panel |
| ☐ | Users can save PDFs, books and videos | Library → Save on any card |
| ☐ | Users can save articles | Your Feed or the article page |
| ☐ | Saved items appear in Saved | Library → Saved tab; `/saved` redirects there |
| ☐ | Saving does NOT remove from Library | The card stays, and shows "Saved" (`test_saving_leaves_the_resource_in_the_library`) |
| ☐ | Removing from Saved leaves Library intact | Remove in Saved → item still in Library, unsaved |
| ☐ | Library and Saved are separate concepts | Library = catalogue of what exists · Saved = what you kept |
| ☐ | Saved has no duplicate destination | One place only: the Library's Saved tab |
| ☐ | Saved content persists | Refresh, or sign in on another browser |
| ☐ | No duplicate rows | Save the same item twice → one row (`test_saving_is_idempotent_and_persists`) |

## AI Safety & Ethics course

Certification was removed by request: no gate, no certificate, no unlock. The
course and its eight lessons remain as normal learning content, and the imaging
workbench is open to any signed-in student.

| | Check | Where |
|---|---|---|
| ☐ | No certification anywhere | No badge, banner, gate or 403 mentioning it |
| ☐ | Course still reads as a real syllabus | `/learn` → AI Safety & Ethics |
| ☐ | Eight real lessons | Intro · Automation bias · Bias & fairness · Privacy · Confidence · Transparency · Ethics · Regulation |
| ☐ | Different lessons show different content | Title, key point and body all change |
| ☐ | Lesson navigation and progress work | Previous / Next, "N of 8 complete", ticks in the sidebar |
| ☐ | Order of reading still enforced | Imaging → Run analysis before a reading → **409** |

## Imaging case references

| | Check | Where |
|---|---|---|
| ☐ | Teachers can create case references | As `instructor@medly.dev` → `/imaging/cases` → New case reference |
| ☐ | Students cannot | The form is absent, and `POST /api/casebook/cases` returns **403** |
| ☐ | Images belong to the right case | `/imaging/cases/:id` — images, context and teaching points together |
| ☐ | Patient identity is anonymised | Anonymisation record lists the removed fields; overlay text is masked |
| ☐ | Automation does not self-certify | A new image is `auto_redacted`; publishing returns **409** until verified |
| ☐ | Students never see unverified images | The API filters them out, and drafts return 403 |

The route a scan takes: teacher → case reference → scan → automatic redaction →
human verification by a named teacher → publish → student.

## Profile and dashboard

| | Check | Where |
|---|---|---|
| ☐ | Settings is its own page, not a Profile section | `/profile` links to `/settings`; the settings themselves live there |
| ☐ | Rank opens the leaderboard | Rank button and the Global Rank stat → `/leaderboard` |
| ☐ | Communities shows joined ones only | `/profile?tab=communities` — from `GET /api/communities/mine` |
| ☐ | Dashboard Badges deep-links to Profile → Badges | Badges stat → `/profile?tab=badges`, badges tab already selected |

## Design and accessibility

| | Check |
|---|---|
| ☐ | Global Library search — one box across title, author, description, publisher and topic, on every type |
| ☐ | Filters describe real columns — level and topic are stored, not inferred |
| ☐ | Cover art on articles and resources, lazy-loaded with intrinsic dimensions |
| ☐ | Image-based challenge questions carry alt text that answers the question |
| ☐ | Icons everywhere instead of emoji |
| ☐ | Streak counts real study days and resets after a missed day |
| ☐ | Keyboard: skip link, visible focus ring on every control, tab order follows the page |
| ☐ | Dark mode and reduced motion in Settings, applied before first paint |
| ☐ | Mobile: four tabs plus a More sheet, not a shrunken sidebar |
| ☐ | Restraint: gradients on primary actions only, no oversized headings, no duplicate CTAs |

## Regression and polish

| | Check |
|---|---|
| ☐ | Existing functionality still works — assistant, certification gate, four-step imaging workflow, governance audit trail |
| ☐ | No broken routes — every nav item, card and button resolves |
| ☐ | Back navigation works, and refresh does not lose persisted state |
| ☐ | Loading, empty and error states exist on every data-backed page |
| ☐ | No console errors on a full click-through |
| ☐ | No placeholder buttons — every control performs a real action or explains why it cannot |

## Automated coverage

```
backend/tests/test_feed_and_saved.py      search over bodies, comments, saving
backend/tests/test_library_and_saved.py   Library survives saving; four types
backend/tests/test_communities.py         search scope, premium gate, chat
backend/tests/test_challenges_points.py   points once per question, rank order
backend/tests/test_casebook.py            teacher-only authoring, anonymisation
backend/tests/test_settings.py            profile edits, password, privacy
backend/tests/test_streak.py              streak counts real days, resets on a gap
```

Plus the existing suites for auth, courses, quizzes, the assistant guardrails,
analysis ordering and governance.
