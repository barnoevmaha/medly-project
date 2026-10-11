# BUILD-PROMPT.md

The prompt that produces this project. Paste the block below into Claude Code,
Cursor, or any coding agent in an empty folder and it will build Medly from
nothing. Use the shorter prompts at the bottom to extend what already exists.

Everything outside the fenced blocks is a note to you, not to the model.

---

## 1 — The full build prompt

````text
Build a full-stack web application called **Medly**. It is a hackathon entry, and
the judging criteria are the strength of the idea and whether the demo holds up
under questioning — not feature count. Prefer six things that work over twenty
that are stubbed.

## The problem I am solving

Two industry concerns, and they compound each other:

1. Medical curricula contain no AI modules. Students qualify without ever being
   taught how these models work or where they fail.
2. AI is already in routine use reading X-rays and CT, and there are no agreed
   safety or ethics standards governing that use. The result is unexamined trust
   in tools nobody was trained to question, and no clear line of accountability
   when the tool is wrong.

## The solution to build

One platform with three parts that reinforce each other:

1. **A curriculum** that teaches how medical imaging AI works and, more
   importantly, where and why it fails.
2. **A safety standard that is enforced in code, not published as a document.**
   This is the central idea. Every rule in the standard must map to a function
   that returns an error when the rule is broken. A standard in a PDF changes
   nothing; a standard that returns HTTP 403 changes behaviour.
3. **An audit layer** that makes every AI-assisted decision attributable to a
   named human, and surfaces it on a governance dashboard.

The one-line thesis, which the demo must physically demonstrate: **a standard
that is only written down is not a standard.**

## Stack

- Backend: Python, FastAPI, SQLModel, SQLite, JWT auth (python-jose), passlib
  with bcrypt. Pytest for tests.
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Router,
  lucide-react for icons. No component library beyond a handful of small local
  primitives (Button, Card, Badge, Input, Textarea, Progress) written by hand.
- No paid APIs required. Every AI surface must have an offline default so the
  app runs with zero keys configured.

## Layout

```
backend/
  app/
    main.py            FastAPI app, CORS, health endpoint
    config.py          settings read from env, with usable defaults
    db.py              engine + get_session dependency
    security.py        password hashing, JWT, get_current_user,
                       require_roles, require_certified
    models/            SQLModel tables: user, course, quiz, analysis, audit, enums
    routers/           auth, courses, quizzes, assistant, analysis, governance
    services/
      safety.py        THE GUARDRAILS — the most important file in the project
      inference.py     InferenceEngine Protocol + deterministic mock
      assistant.py     rules-based offline assistant + optional LLM provider
      audit.py         the single audit writer
      scoring.py       quiz grading and competency bands
    seed.py            demo users, full curriculum, exam questions, demo activity
  tests/               pytest, weighted toward the guardrails
frontend/
  src/
    lib/api.ts         one typed client covering every endpoint
    pages/             Home, Login, Dashboard, Learn, Course, Quiz, Imaging,
                       Governance, Profile, Library, Community, Challenges
    components/        layout, ui primitives, assistant widget, imaging viewer
```

## The safety standard — six rules, each enforced by named code

Implement all six. `GET /api/governance/standard` must return this list at
runtime so the UI renders exactly what the server enforces and the two cannot
drift apart.

| ID | Rule | Enforced by |
|----|------|-------------|
| S1 | Teaching only. Never diagnose, treat or dose a real patient. | `safety.screen_message` refuses clinical directives |
| S2 | No patient identifiers reach a model, ever. | `safety.screen_message` + `safety.redact` |
| S3 | Every AI output is labelled and carries its limitations. | `safety.apply_disclaimer`, applied in the service layer with no client opt-out |
| S4 | Confidence is always shown; below threshold escalates to a human. | `safety.evaluate_confidence` |
| S5 | A named human commits the decision, and it is logged. | `AnalysisJob.student_finding` + the `audit_events` table |
| S6 | AI-assisted analysis is locked until certification is passed. | `security.require_certified` |

## The anti-automation-bias workflow — build this first

Automation bias is the reason the project exists, so the API must enforce the
order rather than recommend it:

```
POST /api/analysis/cases             create the case
POST /api/analysis/{id}/my-reading   the student's interpretation, before any AI output
POST /api/analysis/{id}/analyze      the model runs — must 409 if the step above was skipped
POST /api/analysis/{id}/decide       the final human call, plus agreed_with_ai: bool
```

That 409 is the heart of the project. Seeing the model first must be
**impossible**, not discouraged. `/analyze` must also 403 for uncertified users.

The final step produces the metric the governance dashboard leads with:
**override rate** — how often a human departed from the model. A cohort that
never disagrees is not reading the images, and the dashboard should say so in
plain words rather than just plotting a number.

## The assistant

A study assistant in a fixed corner widget. Every message passes
`safety.screen_message` before anything else happens.

- Messages containing patient identifiers (MRN, SSN, DOB, email, phone) are
  refused, and the copy that is stored in the audit log is redacted.
- Messages asking for a real clinical decision ("should I prescribe…", "what
  dose…", "is this cancer") are refused with an explanation and an offer to
  teach the underlying concept instead.
- Allowed answers always get a disclaimer appended server-side.
- Refusals must *look* like refusals in the UI. Make the guardrail visible and
  self-explaining — a blocked message is the best thing a judge can see.
- Default provider is a keyword-matched rules engine that needs no API key. An
  optional `MEDLY_ASSISTANT_PROVIDER=anthropic` path uses a real model, with the
  same guardrails applied either way.

## The imaging model

Simulate it, and be explicit about that everywhere in the product. Put a
`MockInferenceEngine` behind an `InferenceEngine` Protocol with
`analyze(case_ref, modality) -> InferenceResult`. Requirements:

- Deterministic: seed the RNG from the case reference so a demo repeats exactly.
- Returns labelled findings with confidences and normalised `[x, y, w, h]`
  bounding boxes in 0..1 so the frontend can overlay at any render size.
- Roughly one case in four is deliberately low-confidence, so the escalation
  path is exercised in the demo rather than merely described.
- Ships `known_limitations` and a `training_data` description with every result.
  A user must be able to see whether the model was ever validated on people
  like theirs.

Say plainly in the README that the model is simulated and the safety scaffolding
around it is what is real. That is the honest framing and it is also the
stronger one — the scaffolding is the contribution.

## Curriculum to seed

Three courses. Write real teaching content, not lorem ipsum — a judge will read
one lesson body.

1. **AI in Medicine: Foundations** — what a model actually does (pattern
   matching, not reasoning); sensitivity, specificity and the prevalence trap
   worked through with real numbers; dataset shift and why models fail on
   unfamiliar equipment.
2. **AI Safety & Ethics Certification** — automation bias; informed consent and
   data protection; accountability when the model is wrong; what to do with a
   low-confidence output. This course carries the certification exam.
3. **Supervised Imaging Practice** — how to work a case with AI assistance
   without surrendering the read.

Seed a certification exam with a pass mark of 80% and a shorter foundations
knowledge check at 60%. Questions should be genuinely difficult, with a real
explanation attached to each — the explanation is teaching material, not
feedback boilerplate. Mix single-answer and multi-answer questions, and grade
multi-answer as exact-set-match so guessing every option scores nothing.

## Demo accounts (seed them)

Password `medly1234` for all of them:

- `student@medly.dev` — not certified, so AI features are locked
- `certified@medly.dev` — certified, full workflow available
- `instructor@medly.dev` — sees every user's audit trail
- `admin@medly.dev`

Students see only their own audit trail. Instructors and admins see everyone's,
because oversight that only covers volunteers is not oversight.

## The demo I need to be able to give, in six minutes

Build so that this runs end to end without touching a database by hand:

1. Ask the assistant "What is automation bias?" — a real answer, with a
   disclaimer the client cannot remove.
2. Ask "Should I prescribe antibiotics for my patient?" — refused, and it looks
   refused. The guardrail explains itself and offers to teach instead.
3. Ask something containing an MRN — refused, and the stored copy is redacted.
4. As `student@medly.dev`, try to run an imaging analysis — 403, AI locked.
5. Take the certification exam, pass it, watch AI unlock.
6. Work a case: record your own reading, then the model runs, then disagree
   with it.
7. Open Governance — the override is there, attributed and timestamped, next to
   the block rate and disclaimer coverage.

Step 7 is the point. Everything before it exists to make that row meaningful.

## Engineering standards

- Comments explain *why*, never *what*. Anything self-evident from the code
  should not be commented at all. Where a design choice is arguable, say what
  the tradeoff was.
- No dead code, no TODO placeholders, no commented-out blocks.
- Pydantic models for every request and response. Correct answers must never
  appear in a quiz payload sent to the client.
- Tests: around 40, concentrated on the guardrails — PHI refusal and redaction,
  clinical-directive refusal, the 403 before certification, the 409 for
  out-of-order analysis, disclaimer presence, grading edge cases.
- Every AI-touching code path writes exactly one audit row through
  `audit.log_event`. No other module writes to that table.
- Frontend: no `dangerouslySetInnerHTML`. One typed API client; pages never call
  `fetch` directly. Guard the authenticated layout so a signed-out visit
  redirects to login instead of rendering a page full of 401s.

## Watch out for these specific mistakes

- FastAPI evaluates `response_model=` at import time. A Pydantic model defined
  below the route that references it is a `NameError` on boot, not a runtime
  error, so the whole app fails to start. Define response models above their
  routes.
- Order routes so literal paths come before parameterised ones —
  `/quizzes/attempts/me` must be declared before `/quizzes/{quiz_id}`.
- `vite.config.ts` using `node:path` or `__dirname` fails to type-check unless
  `@types/node` is installed. Either add the dependency or resolve the alias
  from `import.meta.url`.
- Don't let the frontend re-implement the safety rules. It should call the API
  and render whatever the API says, including the errors. Two copies of a rule
  is one copy too many.

## README

Write one. Include: the problem, the thesis in a sentence, exact run commands
for both halves, the demo account table, the six-rule standard with its
enforcement column, an explicit "what is real and what is simulated" section,
and an honest list of known gaps. Judges trust a project more when it tells them
where it is thin.
````

---

## 2 — Follow-up prompts

Each of these assumes the project already exists. Give one at a time.

### Replace the simulated model with a real one

````text
Implement a real imaging model behind the existing `InferenceEngine` Protocol in
`backend/app/services/inference.py`. Keep `MockInferenceEngine` and select
between them with `MEDLY_INFERENCE_ENGINE`. Load a CheXNet-style ONNX classifier
from `MEDLY_ONNX_MODEL_PATH`, map its outputs to the existing `Finding` dataclass
including normalised bounding boxes, and populate `known_limitations` and
`training_data` from the model card rather than hardcoding strings. Nothing
outside this file may change. Add tests that skip cleanly when no weights are
present.
````

### Add a cohort view for instructors

````text
Add an instructor-only cohort dashboard at `/api/governance/cohort` and a
frontend page for it. Per student: cases completed, override rate, mean time
between the model output being revealed and the decision being committed, and
count of low-confidence cases accepted without override. Lead with the students
whose override rate is near zero and whose decision latency is under ten seconds
— that pattern is rubber-stamping, and the UI should name it as such rather than
leaving the reader to infer it. Reuse `require_roles(Role.INSTRUCTOR, Role.ADMIN)`.
````

### Make the audit trail tamper-evident

````text
Make `audit_events` append-only and tamper-evident. Add a `prev_hash` and `hash`
column; each row hashes its own content plus the previous row's hash. Add
`GET /api/governance/audit/verify` which walks the chain and reports the first
break. Surface a verification badge on the Governance page. Do not change the
`log_event` call signature — every existing call site must keep working.
````

### Harden auth for something closer to production

````text
Move auth off `localStorage`. Issue a short-lived access token in memory and a
refresh token in an httpOnly, SameSite=Lax cookie, with a rotation endpoint and
server-side revocation. Add Alembic and generate an initial migration from the
current schema, replacing `SQLModel.create_all`. Update the tests and the
"known gaps" section of the README to match.
````

### Localise

````text
Add i18n to the frontend with a lightweight solution — no heavy dependency.
Extract every user-facing string into locale files, English first, and add one
more language. Keep `src/data/content.ts` as the English source of truth. Lesson
bodies and exam questions come from the API, so add an `Accept-Language` header
to the client and a `lang` column on lessons and questions with English
fallback.
````

---

## 3 — Prompting notes

Things that made a measurable difference when this was built:

- **State the thesis, not just the features.** "A standard that returns 403
  changes behaviour" produced better architecture than any list of endpoints
  would have. The model designs toward an argument if you give it one.
- **Name the file that matters.** Saying `safety.py` is the most important file
  concentrates effort where the judging will.
- **Demand a demo script.** Specifying the seven-step walkthrough forces the
  build to be end-to-end runnable instead of a set of endpoints that each work
  alone.
- **Ask for the honest section.** Requesting "what is real and what is
  simulated" produces a stronger project, because the model stops trying to
  disguise the simulated parts and puts the effort into the real ones.
- **Say what you don't want.** "No TODO placeholders, no commented-out code, no
  comments restating the code" removes an entire category of cleanup.
- **Fix forward, one prompt at a time.** When something breaks, paste the actual
  traceback or the failing HTTP status. Don't describe the bug in prose — the
  error text carries more signal than a summary of it.
