# Medly — AI safety training for medical education

**Hackathon problem.** Medical curricula contain no AI modules. AI is already
reading X-rays and CTs, but no agreed safety or ethics standards govern that use.
The result is unexamined trust in tools nobody was trained to question.

**What this is.** A platform with three parts: a curriculum that teaches how these
models work and where they fail, a safety standard that is *enforced in code rather
than published as a document*, and an audit layer that makes every AI-assisted
decision attributable to a named human.

The argument in one line: **a standard in a PDF changes nothing; a standard the
API enforces changes behaviour.**

---

## Run it

Fastest path, if you have Docker:

```bash
docker compose up --build     # API on :8000, web on :5173, seeded on first boot
```

Otherwise, two terminals.

```bash
# 1 — API
cd backend
python3.13 -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m app.seed
uvicorn app.main:app --reload                           # :8000, docs at /docs
```

> **Use Python 3.13, not 3.14.** Several dependencies have no 3.14 wheel yet, so
> pip falls back to compiling pydantic-core with Rust and the install fails.
> Everything here is wheel-only on 3.13.

```bash
# 2 — web
cd frontend
npm install
npm run dev                                          # :5173
```

Sign in at <http://localhost:5173/login>. Password for every seeded account is
`medly1234`.

| Account | Why it exists |
|---|---|
| `student@medly.dev` | Free student — cannot create communities |
| `premium@medly.dev` | Premium student — can create communities |
| `instructor@medly.dev` | Teacher — authors imaging cases, sees all audit data |

No AI API key is needed. Both AI surfaces have offline defaults.

---

## The six-minute demo

1. Open the assistant (bottom right) and ask **"What is automation bias?"** — a
   real answer, with a disclaimer the client cannot remove.
2. Ask **"Should I prescribe antibiotics for my patient?"** — refused, and it
   *looks* refused. The guardrail explains itself and offers to teach instead.
3. Ask something with an MRN in it — refused, and the stored copy is redacted.
4. Open **Imaging**, create a case and hit *Run analysis* before writing a
   reading — **409, wrong order.**
5. Write your reading, then run it. Only now does the model speak.
6. Disagree with it and commit your own decision.
7. Open **Governance** — your override is there, attributed and timestamped,
   alongside the block rate and disclaimer coverage.

Step 7 is the point. Everything before it exists to make that row meaningful.

---

## The safety standard

Six rules, each with the function that enforces it. `GET /api/governance/standard`
returns this at runtime, so the UI renders exactly what the server enforces — they
cannot drift apart.

| | Rule | Enforced by |
|---|---|---|
| **S1** | Teaching only — never diagnose, treat or dose a real patient | `safety.screen_message` |
| **S2** | No patient identifiers reach a model, ever | `safety.screen_message` + `redact` |
| **S3** | Every AI output is labelled and carries its limitations | `safety.apply_disclaimer` |
| **S4** | Confidence always shown; below threshold escalates to a human | `safety.evaluate_confidence` |
| **S5** | A named human commits a decision, and it is logged | `AnalysisJob.student_finding` + `audit_events` |
| **S6** | The model runs only after the student's own reading is recorded | `analysis.analyze` — HTTP 409 |

## The anti-automation-bias workflow

Automation bias is the reason the project exists, so the API enforces the order
rather than recommending it:

```
POST /api/analysis/cases             create the case
POST /api/analysis/{id}/my-reading   your interpretation, before any AI output
POST /api/analysis/{id}/analyze      the model runs — 409 if you skipped the step above
POST /api/analysis/{id}/decide       your final call, and whether you agreed
```

That 409 is the heart of it. Seeing the model first is impossible, not discouraged.

The last step produces the metric the governance dashboard leads with: **override
rate**. A cohort that never disagrees with the model is not reading the images, and
the dashboard says so in as many words.

---

## What is real and what is simulated

Worth being direct about, because a judge will ask.

**Real:** the curriculum, the guardrail layer, the audit trail, the governance
metrics, the enforced workflow ordering, points and ranking, the premium and
teacher permissions, and the anonymisation gate on case images. All of it runs
and is tested.

**Simulated:** the imaging model. `MockInferenceEngine` returns plausible findings
with calibrated-looking confidences, seeded from the case reference so a demo is
repeatable. Roughly one case in four is deliberately low-confidence so the
escalation path is exercised rather than described.

That is a deliberate choice, not a shortcut. The project is about the safety
scaffolding around clinical AI, and the scaffolding is what had to be real. The
engine sits behind a `Protocol` — implement `InferenceEngine.analyze` and a real
model drops in with no other changes.

**No real patient data is used anywhere.** This is a training apparatus, not a
medical device, and every AI output in the product says so.

---

## Layout

```
backend/          FastAPI + SQLModel. See backend/README.md
  app/services/safety.py     the guardrails — the file most worth reading
  app/services/inference.py  InferenceEngine interface + deterministic mock
  app/routers/analysis.py    the enforced four-step workflow
  app/routers/casebook.py    teacher-authored cases + the anonymisation gate
  app/routers/feed.py        articles, comments, likes — search covers bodies
  app/routers/saved.py       one Saved collection for four content types
  app/routers/communities.py membership, chat, and the premium gate on creation
  app/routers/challenges.py  question sets that pay out once per question
  app/services/anonymize.py  de-identification that refuses to certify itself
  app/services/gamification.py points, rank and badges, from real rows only
  tests/                     weighted toward the guardrails and the permissions

frontend/         React + Vite + Tailwind. See frontend/README.md
  src/lib/api.ts             one typed client; pages never call fetch directly
  src/lib/session.tsx        one /me call shared by every page
  src/components/assistant/  the fixed-corner study assistant
  src/lib/preferences.ts     theme, motion and toast preferences for this device
  src/components/feed/       ArticleFeed — used full-size and as a preview
  src/pages/Dashboard.tsx    stats, featured challenge, feed preview
  src/pages/Feed.tsx         Your Feed — search covers article bodies
  src/pages/Article.tsx      the expanded article and its comments
  src/pages/Library.tsx      the resource catalogue: books, PDFs, videos
  src/pages/Saved.tsx        what this user kept, across all four types
  src/pages/Settings.tsx     account, security, privacy, appearance, session
  src/pages/Community.tsx    discovery; CommunityRoom.tsx is the chat
  src/pages/Challenges.tsx   list; ChallengeRun.tsx is the question runner
  src/pages/Learn.tsx        the course catalogue and progress
  src/pages/Course.tsx       lesson reader with prev/next and progress
  src/pages/Quiz.tsx         knowledge checks, graded server-side
  src/pages/Imaging.tsx      the four-step workbench — the core of the demo
  src/pages/Casebook.tsx     case references; CaseReference.tsx is one case
  src/pages/Governance.tsx   audit trail + the six rules
  src/data/content.ts        marketing copy only — the rest comes from the API

BUILD-PROMPT.md   spec for regenerating or extending this with Claude Code / Cursor
DEPLOY.md         Docker, GitHub and Railway, step by step
```

## Routes

| Route | What it does |
|---|---|
| `/login` | Demo accounts listed on the form |
| `/dashboard` | Stats, featured challenge and a feed preview |
| `/feed` | Your Feed — full stream, search covers article bodies |
| `/feed/:slug` | The full article, with comments |
| `/community` | Community discovery; creating one needs Premium |
| `/community/:slug` | A community and its chat |
| `/challenges` | Active challenges and the leaderboard |
| `/challenges/:slug` | The challenge itself — questions, feedback, points |
| `/library` | Videos · Saved · Books · PDFs · Articles, one global search |
| `/saved` | Redirects to `/library?tab=saved` |
| `/settings` | Account, security, privacy, appearance, session |
| `/leaderboard` | Full ranking by points |
| `/profile` | Overview, badges, communities, activity (`?tab=badges` deep-links) |
| `/learn` | Course catalogue and certification state |
| `/learn/:slug` | Lessons, reader, and the exam entry point |
| `/quiz/:id` | The certification exam; passing unlocks AI |
| `/imaging` | The four-step workbench |
| `/imaging/cases` | Case references; `/imaging/cases/:id` opens one |
| `/governance` | Audit trail, metrics, and the six rules |

**Navigation.** Five student destinations — Dashboard, Communities, Challenges,
Library, Profile — then Go Premium, Settings and Log out in the sidebar footer.
AI Training, the imaging Workbench and Governance are teaching tools: linked
from the Dashboard, and listed in the sidebar only for instructors and admins.

**Saved is a tab inside Library**, not a destination of its own. It is a view of
the catalogue filtered to your bookmarks; saving never removes anything from its
own tab.

## Permissions

Enforced in the API, mirrored in the UI. A direct `curl` gets the same answer.

| | Student | Premium student | Teacher |
|---|---|---|---|
| Read, comment, save, join challenges, earn points | ✅ | ✅ | ✅ |
| Join communities and post in them | ✅ | ✅ | ✅ |
| Create a community | ❌ 403 | ✅ | ✅ |
| Create and manage case references | ❌ 403 | ❌ 403 | ✅ |
| See unpublished cases | ❌ | ❌ | ✅ |
| Verify an image's anonymisation | ❌ | ❌ | ✅ |

## How a scan reaches a student

```
Teacher → case reference → scan attached → automatic redaction
        → human verification (named teacher) → publish → student
```

The automatic pass lands an image as `auto_redacted`, which is explicitly not
good enough to show anybody. `POST /api/casebook/images/{id}/verify` is
teacher-only, and `publish` returns 409 while any image is unverified. Students
are served only `verified` images — the filter is in the API, not the interface.

Demo cases are synthetic. No real patient data is used anywhere.

## Known gaps

Honest list, in case you want to close any before judging:

- Auth tokens live in `localStorage`. Fine for a demo, not for production.
- No refresh tokens; the JWT lasts 12 hours.
- `SQLModel.create_all` plus a small additive column migration (`db.migrate_columns`)
  instead of Alembic. It adds missing columns on boot and backfills them; it will not
  rename or drop anything. Add Alembic before a schema change that needs either.
- Premium is a flag, not a payment. `POST /api/profile/premium` flips it so the
  gate can be demonstrated from both sides; no provider is wired up or implied.
- Cover art is generated SVG in `frontend/public/covers`, not photography. No
  external image requests, and nothing to lazy-load from a third party.
- Certification was removed by request. The AI Safety & Ethics course remains as
  a normal course; nothing gates the imaging workbench except the order of
  reading. Existing databases are migrated by `seed._rename_legacy_rows` and
  `db.DROPPED_COLUMNS`.
- SQLite on one volume: single writer, no replication, pinned to one instance.
  Swap `MEDLY_DATABASE_URL` for Postgres before this carries real load.
- `datetime.utcnow()` is used throughout and is deprecated from Python 3.12.
  It still works; migrating means moving every call site at once, since mixing
  naive and aware datetimes breaks the audit queries.
- The offline assistant is keyword-matched, not a language model. Set
  `MEDLY_ASSISTANT_PROVIDER=anthropic` with a key for real generation — the
  guardrails apply either way.
- Lesson content is written for the demo and is not peer-reviewed teaching material.
