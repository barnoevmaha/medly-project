# Medly — Promo Video · Master Prompt for Claude Design

**Spec:** 110.0 s · 16:9 · 1920×1080 @ 60 fps (6600 frames) · dark clinical tone · **all on-screen language: English**

**Two rules that override everything else in this document:**

1. **Every pixel of product UI in this film is a captured pixel.** Nothing about the interface is recreated, redrawn, approximated or "inspired by". If it appears on screen as Medly, it was photographed off the running application.
2. **Every word on screen is English**, and every UI string is the string the app actually renders — copied from the source, not paraphrased.

---

## Why the pipeline is split in two

Claude Design is good at two different jobs, and they must not be mixed:

| Stage | What it produces | Rule |
|---|---|---|
| **A · Capture** | `capture.mjs` — a Playwright harness that drives the *real, running* Medly app and records deterministic frame sequences + a coordinate manifest | Touches the real app only. Produces no design. |
| **B · Composite** | `medly-promo.html` — a frame-accurate timeline that plays those captures with camera moves, masks, callouts and typography | Never draws a button, card, sidebar or table. Only real frames + text on black. |
| **C · Render** | Playwright frame dump → ffmpeg → H.264 | Deterministic, reproducible |

If Stage B ever needs a UI element that Stage A did not capture, the answer is **go back and capture it** — never draw it.

---

# PART 1 — THE MASTER PROMPT

> Paste everything below the divider into Claude Design as one message.

---

## ROLE

You are a senior motion designer with ten years of software promo work (the Linear / Vercel / Stripe / Framer / Arc tier). You work in timelines, not compositions: every object has an in, an out, a delay and a curve, and you know why `cubic-bezier(0.16, 1, 0.3, 1)` reads expensive and `ease-in-out` reads cheap.

You are also disciplined about a rule most motion designers break: **you do not draw product UI.** You capture it and you composite it. A promo that redraws the interface is a promo that lies about the product, and this particular product is about not lying.

Build a **110.0-second promo film for Medly** in three deliverables: a capture harness, a compositing timeline, and a render script.

## THE PRODUCT (this is the whole factual brief — invent nothing beyond it)

Medly teaches clinicians to work with AI safely. The thesis, in one line:

> **A standard in a PDF changes nothing. A standard the API enforces changes behaviour.**

Three layers:

1. **Curriculum** — courses on how these models work and where they fail.
2. **Guardrail layer** — an assistant that screens every message: refuses to treat, never lets a patient identifier through, and carries a disclaimer the client cannot remove.
3. **Audit layer** — every AI-assisted decision is attributable to a named human.

The core is **automation bias**. The order of work is not recommended, it is enforced by the server:

```
POST /api/analysis/cases             create the case
POST /api/analysis/{id}/my-reading   your interpretation, before any AI output
POST /api/analysis/{id}/analyze      the model runs — HTTP 409 if the step above was skipped
POST /api/analysis/{id}/decide       your final call, and whether you agreed
```

Assistant endpoints: `POST /api/assistant/chat` and `POST /api/assistant/chat/stream`.
Standard endpoint: `GET /api/governance/standard` — returns the six rules at runtime, so the UI renders exactly what the server enforces.

The six rules, each bound to a function in code:

| | Rule | Enforced by |
|---|---|---|
| S1 | Teaching only — never diagnose, treat or dose a real patient | `safety.screen_message` |
| S2 | No patient identifiers reach a model, ever | `safety.screen_message` + `redact` |
| S3 | Every AI output is labelled and carries its limitations | `safety.apply_disclaimer` |
| S4 | Confidence always shown; below threshold escalates to a human | `safety.evaluate_confidence` |
| S5 | A named human commits a decision, and it is logged | `AnalysisJob.student_finding` + `audit_events` |
| S6 | The model runs only after the student's own reading is recorded | `analysis.analyze` — HTTP 409 |

The imaging engine is a deterministic mock and is labelled as such. **No patient data is used anywhere.** The film must not imply otherwise.

## REAL UI STRINGS (use these exactly — do not paraphrase, do not "improve")

These are copied from the source. Any on-screen text that belongs to the product must match:

**Imaging workbench** — `frontend/src/pages/Imaging.tsx`

```
Page title       Imaging workbench
Page subtitle    Read the film yourself first. Only then does the model speak.
Stepper          Case · Your reading · Model output · Your decision
Panel            New case
Placeholder      Case reference, e.g. CXR-1042
Panel            Your cases
Hidden state     Model annotations hidden until your reading is recorded.
Panel            Your reading
Body             Write what you see, before the model runs. Once recorded it cannot be
                 edited — that is what makes the comparison honest.
Placeholder      e.g. Opacity in the right lower zone, no effusion, heart size normal…
Button           Lock in my reading
Panel            Model output
Body             Runs only after your reading is locked in.
Button           Run analysis
409 heading      Blocked — HTTP 409, wrong order
409 footnote     This came from the API, not from this page. The rule holds for any
                 client that talks to it.
Warning          At least one finding sits below the confidence threshold.
                 This case is flagged for human review.
Link             Show known limitations of this model
Panel            Your decision
Body             You are accountable for the call, not the model. Say what you would do
                 and whether the model changed your mind.
Placeholder      Your final interpretation and next step…
Button           Commit — I agree with the model
Button           Commit — I disagree
Link             Open Governance
```

**Governance** — `frontend/src/pages/Governance.tsx`

```
Page title       Governance
Page subtitle    Every AI interaction on this platform, and what the humans did about it
Stat             AI interactions            hint: last 30 days
Stat             Human override rate        hint: humans disagreeing with AI
Stat             Requests blocked           hint: <n>% of interactions
Stat             Disclaimer coverage        hint: must always be 100%
Alert            Possible automation bias
Alert body       Not one AI suggestion has been overridden. Either the model is flawless,
                 or people have stopped reading the images. The second is far more likely.
Section          The safety standard
Section          Audit trail
Badges           overridden · needs review
```

**Assistant** — `frontend/src/components/assistant/AssistantWidget.tsx`

```
Title            Medly AI
Quick actions    Simpler · Deeper · Example · MCQs · Case · Quiz me
```

If a string you need is not in this list, **read it out of the source before using it.** Never write product copy yourself.

---

## STAGE A — `capture.mjs` (the capture harness)

This is the part that makes the film honest. Write a Playwright script that drives the **real running application**.

**Environment**

```bash
docker compose up --build          # API :8000, web :5173, seeded on first boot
# accounts: student@medly.dev / instructor@medly.dev — password medly1234
```

**Harness requirements**

1. Chromium, viewport `1920×1080`, `deviceScaleFactor: 2`, `colorScheme: 'dark'`, `reducedMotion: 'reduce'` — the app's own animations must be off so the film's motion is the only motion.
2. Log in through the real login form. No injected tokens, no mocked API. Every response on screen came from the API.
3. **Freeze time and randomness** so the capture is byte-identical on re-run: `page.clock.install()` with a fixed instant, and seed the imaging mock with a fixed case reference (`CXR-1042`) so the same findings and confidences come back every time.
4. Capture **frame sequences, not screenshots**: for each beat, drive the interaction and dump PNGs at 60 fps into `captures/<beat-id>/%05d.png` using `page.screenshot()` on a fixed clock tick, or `page.video` at 60 fps and extract with ffmpeg. Frame sequences beat video for compositing — no inter-frame compression artefacts on text.
5. **Emit a coordinate manifest.** For every element the compositor will move the camera to or point at, record `boundingBox()` into `captures/manifest.json`:

```json
{
  "beat": "step3-409",
  "frames": 420,
  "fps": 60,
  "anchors": {
    "runAnalysisButton": { "x": 1140, "y": 712, "w": 268, "h": 44 },
    "errorCard":         { "x": 452,  "y": 388, "w": 980, "h": 156 },
    "confidenceBadge":   { "x": 1204, "y": 640, "w": 92,  "h": 28 }
  },
  "capturedStrings": {
    "errorHeading": "Blocked — HTTP 409, wrong order",
    "meanConfidence": "61.4%"
  }
}
```

`capturedStrings` is not decoration — the compositor reads real values from it instead of inventing numbers. **If a figure appears in the film, it was read off the screen.**

6. **Move the mouse for real.** Use `page.mouse.move()` along a Bézier path with easing, a 2–3 px overshoot-and-correct before each click, and a deliberate hover pause before consequential clicks. The cursor in the final film is the real cursor recorded in the real DOM, not a drawn arrow.
7. Type with `page.keyboard.type()` at a jittered delay (28–74 ms per character, +180 ms after a comma, +320 ms after a full stop).

**Beats to capture** (one directory each):

| id | What the harness does |
|---|---|
| `assist-answer` | Open Medly AI, ask `What is automation bias?`, let the real answer stream in, disclaimer visible |
| `assist-refuse` | Ask `Should I prescribe antibiotics for my patient?` — capture the real refusal and how it offers to teach instead |
| `assist-redact` | Ask a question containing an MRN — capture the real redaction |
| `step1-case` | Imaging workbench, create case `CXR-1042`, film loads with `Model annotations hidden until your reading is recorded.` |
| `casebook-verify` | Sign in as instructor, open a case reference with an `auto_redacted` image, run the real teacher verification, attempt publish before verification to capture the real refusal |
| `step2-reading` | Type the reading, click `Lock in my reading`, capture the locked state |
| `step3-409` | Click `Run analysis` **before** the reading on a second case — capture the real `Blocked — HTTP 409, wrong order` card |
| `step3-output` | Back on the prepared case, click `Run analysis`, capture findings streaming in, the confidence bars, the below-threshold warning, the disclaimer, and `Show known limitations of this model` expanded |
| `step4-decide` | Type the decision, hover, click `Commit — I disagree`, capture the confirmation |
| `gov-dashboard` | Open Governance, capture the four stat cards, the audit trail with the new row at the top |
| `gov-standard` | Scroll `The safety standard` — all six rule cards with their `Enforced by` functions |

Every beat must also save `network.har` so the API status codes shown in the film can be verified against what actually happened.

---

## STAGE B — `medly-promo.html` (the compositor)

**Hard contract**

1. **One file.** All CSS and JS inline. External assets: the captured frame sequences, plus Inter and Plus Jakarta Sans (self-hosted, as the app does).
2. **Timeline, not animation.** A global `renderFrame(t)` where `t` runs 0 → 110. Any frame is reproducible from any starting point. No `setTimeout` chains, no `IntersectionObserver`, no scroll.
3. **Modes:** `?mode=play` (rAF realtime) · `?mode=scrub` (scrubber with block markers) · `?mode=render&fps=60` (deterministic `t += 1/60` driven by `window.__tick()`).
4. Scene is a fixed 1920×1080 stage, fitted with `transform: scale()` on the root. Nothing is responsive.
5. **The only permitted visual sources are:**
   - captured frame sequences from Stage A,
   - typography on a flat background,
   - a monospace API log strip,
   - masks, vignettes, and rectangular highlight outlines anchored to `manifest.json` coordinates.

   **There is no sixth category.** No drawn card, no drawn sidebar, no fake table row, no recreated button. If you find yourself writing `<button class="btn-primary">Run analysis</button>`, you have already failed the brief.
6. **Camera = transform on the capture layer.** Push-ins and macro shots are `scale` + `translate` on the captured frame, computed from the anchor boxes in the manifest so the crop lands exactly on the real element.
7. **Callouts anchor to real coordinates.** A highlight ring around the confidence badge is drawn at the badge's captured bounding box, not eyeballed.
8. No `localStorage` / `sessionStorage`. Frames 0 and 6600 must render correctly cold.

**Motion system — these tokens only, no `ease`, no `ease-in-out` on anything visible:**

```
--e-out    cubic-bezier(0.16, 1, 0.30, 1)     elements entering, 520–720 ms
--e-in     cubic-bezier(0.70, 0, 0.84, 0)     elements leaving, 240–320 ms
--e-soft   cubic-bezier(0.33, 1, 0.68, 1)     existing objects moving
--e-snap   cubic-bezier(0.22, 1.6, 0.36, 1)   overshoot — refusals only, twice in the film
--e-cam    cubic-bezier(0.65, 0, 0.35, 1)     camera moves on the capture layer
```

**Rules that do not bend:**

- **Cascade, never simultaneity.** Overlay elements in a group stagger 40–70 ms. A whole section fading in at once is the single loudest tell of cheap AI video.
- **Motion is shorter than reading.** When an animation ends, the frame holds still for at least 0.8 s before the next event. On a 110-second film these holds are load-bearing, not decoration.
- **Small displacement.** Overlay `translateY` ≤ 16 px, `scale` 0.985 → 1. Expensive motion is short and close. Nothing flies across the frame.
- **Camera drift.** A constant, almost invisible drift on the capture layer — `scale` 1.000 → 1.012 and ±8 px translate on a ~14 s sine. This is what stops a still capture from reading as a dead screenshot.
- **Overlap.** The next event starts 120–180 ms before the previous one finishes. Butt-joined events read as PowerPoint.
- **Never animate** `width`, `height`, `top`, `left`. `transform` and `opacity` only; `clip-path: inset()` for reveals.

**Pacing profile** — track events per second per block and hold to this:

```
Act I    0.9  moderate
Act II   1.4  three quick beats back to back
resets   0    black card, text only
Act III  0.6 on steps 1–2 · peak 2.1 at the 409 · 0.7 on the decision
Act IV   1.1 on the dashboard, decaying to 0.5 at the end
```

**Colour semantics.** Teal = the system working. Coral = a human intervening. Red = a refusal. **Red appears exactly twice in 110 seconds** — the guardrail block at 0:27 and the 409 at 0:57 — and the second is visibly stronger than the first. Everything else obeys the app's own palette, because it *is* the app's palette: it arrives in the captured pixels.

---

## THE THREE RESET CARDS

Flat background, one line of Plus Jakarta Sans 600 / 40 px, centred. In `--e-out` 420 ms, hold, out `--e-in` 260 ms. No other motion. These are the attention reset points, and they are the spine of the film:

- **R1 · 20.6 → 22.0** — `First, the conversation is guarded.`
- **R2 · 35.0 → 36.6** — `Then, the decision is.`
- **R3 · 80.4 → 81.8** — `And a record is left.`

If a viewer remembers only these three lines, the film worked.

---

## SHOT LIST (timecodes are hard, ±0.2 s)

Legend for **register** — the thing that must keep changing: `TYPE` = typography on flat ground · `WIDE` = captured app, full frame · `MACRO` = captured app, camera pushed into one element.

### ACT I — THE PROBLEM

**Block 0 · Cold open · `0:00 → 0:05` · TYPE**

- `0.0–0.6` Flat near-black `hsl(200 30% 6%)`. Nothing. Hold it — the pause is worth more than any animation.
- `0.6` A single hairline rule grows 0 → 420 px, teal at 0.6 opacity, `--e-out`, 640 ms.
- `1.2` Under it, monospace, typed character by character with human jitter: `X-ray → AI → diagnosis`
- `2.6` `AI` gets a teal underline that wipes in left-to-right via `clip-path`, 380 ms.
- `3.4` Inter 400 / 22 px, muted: `Nobody was trained to question it.` — fade + 16 px, `--e-out`.
- `4.4` Out: `scale → 0.96`, `opacity → 0`, blur 0 → 8 px, `--e-in`, 320 ms.

**Block 1 · Automation bias, stated by the product itself · `0:05 → 0:14` · TYPE → WIDE**

- `5.0` Plus Jakarta 700 / 88 px, entering word by word at 90 ms stagger: `Medical curricula contain no AI module.`
- `7.4` Second line, 44 px, muted teal: `AI is already reading the films.`
- `9.0` Cut to the captured `gov-dashboard` beat, cropped to the **real** `Possible automation bias` alert card. `clip-path` reveal, 520 ms. The alert's own words carry the act — do not retype them as overlay:
  `Not one AI suggestion has been overridden. Either the model is flawless, or people have stopped reading the images. The second is far more likely.`
- `11.4` Camera pushes 1.0 → 1.18 on the last sentence, `--e-cam`, 1200 ms. Slow. Let it be read.
- `13.2` Out, `--e-in`. The capture layer leaves 400 ms after the overlay — layers never exit together.

**Block 2 · Thesis · `0:14 → 0:20.6` · TYPE**

- `14.2` Centre, 72 px, two lines, 260 ms apart:
  `A standard in a PDF changes nothing.`
  `A standard the API enforces changes behaviour.`
- `16.4` Line one drops to 0.35 opacity, `--e-soft`, 480 ms. Line two holds full and takes `text-shadow: 0 0 40px hsl(174 62% 45% / 0.35)`.
- `18.6` The log strip makes its first appearance, monospace, small: `GET /api/governance/standard → 200`
- `19.6` Both lines rise 24 px and dissolve, `--e-in`.

**→ R1 · `20.6 → 22.0` · `First, the conversation is guarded.`**

---

### ACT II — THE CONVERSATION IS GUARDED

Three quick beats in a row. This is the densest stretch of the film — after a slow opening it should feel like a short series of hits.

**Block 3 · The assistant answers · `0:22 → 0:26.4` · WIDE**

- `22.0` `assist-answer` capture opens by `clip-path: inset(50% 0 50% 0)` → `inset(0)`, 620 ms, `--e-out`, shadow rising to `0 40px 120px -20px rgb(0 0 0 / 0.6)`.
- `22.8 → 25.0` **Play the capture at 1× speed.** The typing, the streaming answer and the assistant's own animation are all real. Add nothing on top.
- `25.2` A highlight ring, anchored to the disclaimer's captured bounding box, wipes in around it, 320 ms. One overlay line beneath, 24 px: `The client cannot remove this.`
- `25.8` Log strip: `POST /api/assistant/chat → 200 · disclaimer: S3`

**Block 4 · The assistant refuses · `0:26.4 → 0:30.8` · WIDE → MACRO**

- `26.4` Same capture layer, cut to `assist-refuse`. Hard cut on a beat — no transition.
- `27.6` **First red.** The real refusal lands. Add exactly two things: a 180 ms ±3 px micro-shake on the capture layer, `--e-snap`, and a 6% darkening of everything outside the refusal's bounding box.
- `27.9` Monospace overlay, `scale 1.15 → 1.0`, `--e-snap`: `BLOCKED · S1`
- `28.6` Camera pushes to the part of the real refusal that offers to teach instead, 1.0 → 1.35, `--e-cam`, 700 ms. **The refusal is not a dead end, it is a turn** — and that is the frame that says so.
- `30.2` Log strip: `POST /api/assistant/chat → 200 · blocked: S1`

**Block 5 · Identifiers do not get through · `0:30.8 → 0:35` · MACRO**

- `30.8` Cut to `assist-redact`. Camera starts already pushed in on the input field at 1.9× — the closest shot in the film — computed from the field's manifest box.
- `31.4 → 33.0` Play the real capture: the MRN is typed, and the app's real redaction takes it out. **Do not simulate the redaction with an overlay.** If the redaction is not visible in the capture, capture it again with the stored copy shown.
- `33.4` Overlay, 20 px: `The stored copy is redacted too.`
- `34.0` Log strip: `POST /api/assistant/chat → 200 · redacted: S2`
- `34.4` Camera pulls back, capture layer out `scale → 0.96` + blur, `--e-in`.

**→ R2 · `35.0 → 36.6` · `Then, the decision is.`**

---

### ACT III — THE DECISION IS GUARDED

**Block 6 · Step one: the case, and how a scan reaches a student · `0:36.6 → 0:47` · WIDE**

- `36.6` `step1-case` opens full frame, `clip-path: inset(50% 0 50% 0)` → `inset(0)`, 720 ms.
- `37.6` A highlight ring anchored to the real stepper: `Case · Your reading · Model output · Your decision`. Ring only — the stepper is captured, not drawn.
- `38.4 → 40.0` Play the real case creation: cursor to `New case`, `CXR-1042` typed into the real placeholder field, create.
- `40.4` Cut to `casebook-verify`. Play the real teacher flow: the `auto_redacted` image, the attempt to publish, the API's real refusal, then the named verification.
- `43.0` Highlight ring on the `auto_redacted` status. Overlay, 20 px: `Automatic redaction is not good enough to show anyone.`
- `44.2` Log strip: `POST /api/casebook/images/{id}/verify → 200`
- `44.8` Cut back to `step1-case`, now on the loaded film with the app's real line visible: `Model annotations hidden until your reading is recorded.` Highlight ring on it, 320 ms.
- `46.4` Log strip: `POST /api/analysis/cases → 201`

**Block 7 · Step two: your reading · `0:47 → 0:56.5` · WIDE → MACRO**

- `47.0` Camera pushes to the `Your reading` panel, 1.0 → 1.06, `--e-cam`, 900 ms.
- `48.0 → 53.0` Play the real typing into the real textarea. The app's own placeholder is on screen before it: `e.g. Opacity in the right lower zone, no effusion, heart size normal…`
- `50.2` Overlay, muted, 24 px, alongside the app's own sentence rather than over it: `Once recorded it cannot be edited.`
- `53.6` The real click on `Lock in my reading`. Locked state is the app's, not an overlay.
- `55.2` Log strip: `POST /api/analysis/12/my-reading → 200`
- `55.8` **Dead hold, 700 ms.** Nothing moves. This is the run-up to the most important frame in the film.

**Block 8 · Step three: the 409, then the model · `0:56.5 → 1:11` · WIDE → MACRO**

- `56.5` Cut to `step3-409`. The real cursor reaches `Run analysis`. Click.
- `57.0` **The 409.** The app's own error card lands — real card, real copy: `Blocked — HTTP 409, wrong order`. The film adds one thing: a 260 ms ±5 px shake, three decaying cycles, `--e-snap`, plus a 180 ms 6% darkening everywhere outside the card. **This is the hardest visual hit in the film; everything before it was quieter.**
- `58.0` Camera pushes onto the card's real footnote, 1.0 → 1.4, `--e-cam`, 800 ms:
  `This came from the API, not from this page. The rule holds for any client that talks to it.`
- `59.6` The film's own line, teal, 30 px, on flat ground beside the card: `Seeing the model first is impossible, not discouraged.`
- `61.4` **Hold 1.2 s.** One line, one card, nothing else. The longest stillness in the film, because it is the sentence the film exists for.
- `62.6` Cut to `step3-output`. The reading is already locked — the app shows it.
- `63.6 → 66.0` Play the real analysis: the real findings list, the real confidence bars, the real percentages. **The numbers come from the capture manifest.** Do not animate a counter to a number you chose.
- `66.4` Highlight ring on the real below-threshold warning: `At least one finding sits below the confidence threshold. This case is flagged for human review.`
- `67.6` **Macro:** camera to the confidence bar at 1.5×, `--e-cam`, 620 ms, held 900 ms.
- `69.0` Pull back. Highlight the app's real disclaimer, and let the real `Show known limitations of this model` expansion play out.
- `70.0` Log strip: `POST /api/analysis/12/analyze → 200 · confidence <from manifest> · escalated`

**Block 9 · Step four: the human decides · `1:11 → 1:20.4` · WIDE**

- `71.0` Camera back to 1.0, `--e-cam`, 800 ms. Cut to `step4-decide`.
- `72.0` Highlight ring on the app's own sentence — it says this better than any overlay could: `You are accountable for the call, not the model.`
- `73.4` The real cursor moves to `Commit — I disagree`. **The capture already contains a 700 ms hover pause before the click.** That pause is the acting. Do not trim it.
- `74.6` The real click. The film adds a coral radial `clip-path: circle()` wipe from the click point across the button's captured box, 420 ms — the only tint the film applies to a capture.
- `76.6` Overlay, muted, 24 px: `And it has a name on it.`
- `77.6` Log strip: `POST /api/analysis/12/decide → 201 · agreed=false`
- `78.4` One small card detaches from the button's box and arcs off the right edge, `--e-soft`, 620 ms. **This is the only trajectory across the frame in the entire film** — which is exactly why it reads as meaning and not as an effect.
- `79.4` Capture layer out: `scale → 1.03`, blur 0 → 10 px, fade, `--e-in`, 400 ms.

**→ R3 · `80.4 → 81.8` · `And a record is left.`**

---

### ACT IV — THE PROOF

**Block 10 · Governance · `1:21.8 → 1:35` · WIDE → MACRO**

- `81.8` `gov-dashboard` enters on a horizontal `clip-path` wipe, 520 ms.
- `82.6` The card that flew off at 78.4 lands on the real top row of the real audit trail — the row the decision actually created. Coral tint on its captured box, decaying over 900 ms.
- `84.0` Camera pans down the real audit trail. Among the real rows are the events from Act II. Highlight rings appear on two of them, 700 ms apart. **The viewer recognises what they watched fifty seconds ago.** This is what closes the film logically, and it only works because the rows are real.
- `87.0` Camera to the four real stat cards: `AI interactions` · `Human override rate` · `Requests blocked` · `Disclaimer coverage`. No counters, no invented figures — these are the app's numbers, already on screen.
- `88.8` Highlight the app's own hints: `humans disagreeing with AI` and `must always be 100%`.
- `90.4` Slowest move in the film: push onto a single audit row, 1.0 → 1.25, `--e-cam`, 1400 ms.
- `92.2` Overlay on a blurred plate: `Every decision has a name and a time.`
- `93.8` Out, `--e-in`, 320 ms.

**Block 11 · The six rules · `1:35 → 1:43.5` · WIDE**

- `95.0` Cut to `gov-standard` — the real `The safety standard` section, captured as the app renders it from `GET /api/governance/standard`.
- `96.0 → 100.0` Camera moves across the six real rule cards, holding ~640 ms on each, `--e-cam`. Each card already shows `Enforced by <function>` — that is the whole point, and it is already on screen.
- `100.4` Highlight rings fire on S1, S2 and S6 in the order the viewer met them, 400 ms apart. The film checks itself.
- `102.0` Log strip, last appearance: `GET /api/governance/standard → 200 · the UI renders exactly what the server enforces`
- `103.0` Out, `--e-in`.

**Block 12 · End card · `1:43.5 → 1:50` · TYPE**

- `103.5` Ground settles to `hsl(200 30% 6%)`.
- `104.2` Medly wordmark in: `opacity 0 → 1`, `scale 0.985 → 1`, `--e-out`, 620 ms. No spin, no particles, no glow.
- `105.4` Plus Jakarta 600 / 46 px: `Use AI in medicine. Stay accountable for it.`
- `106.8` The hairline rule from frame one wipes in beneath it, 420 px — the rhyme that closes the composition.
- `107.6` Muted, 22 px: `medly.dev`
- `108.4` 16 px at 0.4 opacity: `Synthetic imaging. No patient data. Ever.`
- `109.0–110.0` Everything holds still, then a 700 ms fade to black.

---

## SOUND (describe in a comment block; synthesise via Web Audio API if you can)

Five layers, no more.

1. **Bed** — 60–80 Hz drone, constant, almost inaudible. Gives the frame weight.
2. **UI clicks** — a dry 8–12 ms transient on each real click. Nothing cartoonish.
3. **Refusals** — two hits. The guardrail block at `27.6` is mid, short, dry. The 409 at `57.0` is low, reverberant, hard-gated, and **6 dB above everything else in the film**.
4. **Typing** — very quiet, below attention, on ~20% of keystrokes, never all.
5. **End** — one decaying teal tone, in with the wordmark.

Music: 84–92 BPM, minimal, no melody. **Every major event lands on a beat.** Structure across 110 s:

```
0:00–0:21   bed only, no pulse
0:21        pulse enters with the assistant panel
0:35–0:36.6 pulse drops for R2, returns denser
0:56.9      music cuts to zero 100 ms before the 409 — the hit lands in silence
0:56.9–0:59.6  silence holds
0:59.6–1:02.6  a single note under "impossible, not discouraged"
1:03.6      pulse returns
1:20.4      drops for R3
1:21.8–1:35 fullest texture in the film
1:43.5      everything cuts; one tone to the end
```

---

## STAGE C — RENDER

Ship a `render.mjs` that loads `medly-promo.html?mode=render&fps=60`, calls `window.__tick()` 6600 times, screenshots each frame, and an ffmpeg command:

```bash
ffmpeg -framerate 60 -i out/%05d.png -c:v libx264 -crf 16 -pix_fmt yuv420p \
       -movflags +faststart medly-promo.mp4
```

---

## FORBIDDEN

- **Any recreated, redrawn or "approximated" product UI.** This is the first and most important rule. No hand-built cards, sidebars, buttons, tables, badges or panels.
- **Any language other than English on screen.** Every word, including overlays, log strip and end card.
- **Any product string you did not read out of the source.** No paraphrasing "Lock in my reading" into "Save reading".
- **Any number you did not read off the capture.** No `23%`, no `95% accuracy`, no student counts, no university counts. If it is not in `capturedStrings`, it does not appear.
- Scroll-parallax, scroll triggers, any scroll dependency.
- Floating particles, star fields, "neural network" webs, abstract globes, brain silhouettes, glowing digital DNA.
- Stock photography of doctors, or any photography of people.
- Blurred gradient blobs breathing in the background.
- Icons that rotate, pulse or bounce without cause.
- More than three overlay elements fading in at once.
- Text over text; more than 12 words in any large-type frame.
- Emoji.
- `ease-in-out` on anything visible.
- Stretching a scene to fill runtime. If a block is not full of meaning, cut it and add a hold — never slow the animation down.

## ACCEPTANCE CHECKS (run these yourself before delivering)

1. **Provenance:** open any frame of the film and any frame of the corresponding capture side by side. Every UI pixel matches. There is no element on screen that does not exist in the running app.
2. Pause at 30 random `?t=` values. Every frame is a finished composition, nothing caught meaninglessly mid-move.
3. The film reads **with the sound off** — every claim is written on screen.
4. The film reads **with the text off** — motion alone shows something was blocked, then allowed.
5. Never more than one centre of attention in a frame.
6. Red appears exactly twice; the second is stronger.
7. **Register changes at least every 20 s** (`TYPE` / `WIDE` / `MACRO`). Three consecutive blocks in one register is a failure — check this against the shot list before rendering.
8. Every log-strip line matches a real request in the beat's `network.har`.
9. Every audit row highlighted in Block 10 corresponds to an event actually performed in Acts II and III.
10. Total duration 110.0 s ±0.2 s, final frame black.
11. Every on-screen word is English.

## WHAT TO RETURN

1. A one-page timecode table: time · block · register · capture beat · event · curve · duration.
2. `capture.mjs` — complete and runnable.
3. `medly-promo.html` — complete.
4. `render.mjs` + the ffmpeg command.

No explanation of what motion design is. Go straight to the work.

---

# PART 2 — WHAT MAKES THIS PROMO UNCOMMON

Each of these is checkable in the finished film.

## 1. The interface is photographed, not illustrated

This is now the film's structural principle, not a production detail. Every product frame is a capture of the running application, driven through the real API with real responses. The consequence is not just honesty — it is texture. Real UI has real focus rings, real streaming latency, real text reflow, real cursor jitter. Recreated UI has none of that, and every viewer feels the difference even when they cannot name it.

## 2. The film proves its claim instead of stating it

Most software promos show an interface and assert that it is good. This one **reproduces the product's central claim in front of the viewer**: the button is clicked, and the server says no. Nobody has to take it on faith — they watch a 409. A promo that demonstrates rather than declares cannot be copied by a competitor who has no such mechanism.

## 3. The refusal is the climax

Every software promo is built on what the product *permits*. This one is built on what it **forbids** — and that is the valuable part. A frame where the AI refuses to speak until the human has thought first is not mistakable for any other film on the market. It is the scene people retell afterwards in words.

## 4. The product's own copy carries the film

`This came from the API, not from this page.` · `Once recorded it cannot be edited — that is what makes the comparison honest.` · `Either the model is flawless, or people have stopped reading the images.` These are already in the app. The film's job is to point the camera at them, not to rewrite them into marketing. Product copy this good is a competitive asset most teams waste.

## 5. Three sentences, not thirty

Across 110 seconds a viewer retains maybe three claims. So the reset cards carry exactly three: *the conversation is guarded → the decision is → a record is left.* Everything else is evidence for them. Most long promos never decide what should survive in memory, and nothing does.

## 6. Two refusals of different weight

The guardrail block at 0:27 is an inoculation — the viewer learns to read red as refusal. When the 409 arrives at 0:57 they already speak the language, and the hit lands twice as hard because it is audibly and visibly bigger. Escalation inside a single colour needs room to develop; a 30-second cut has nowhere to put it. Here the length becomes the advantage.

## 7. Silence as an instrument

Music dropping to zero 100 ms before the hit, and 1.2 seconds of total stillness on the key line. This is what separates an editor from a generator. Cheap films fear emptiness and fill every second with movement. Expensive ones hold, because attention recovers in silence and the next frame lands harder.

## 8. A running API log strip

Monospace lines of real request/response pairs, verified against the captured HAR, running through the whole film. It does two jobs at once: it gives the technical audience — judges, CTOs, faculty — a checkable layer, and it creates a rhythmic signature recognisable within three seconds. Cheap to produce, expensive-looking.

## 9. The film closes its own loop

The events from Act II resurface as real audit rows at 1:24, and the viewer recognises them. Then at 1:40 the rules S1, S2 and S6 light up in the order they were met. This turns 110 seconds from a sequence of scenes into a **system**, where every early frame was setup for a later one. It is only possible because the rows are genuinely the same events — a recreated dashboard could fake the look but not the logic.

## 10. Colour semantics instead of a palette

Teal is the system, coral is a human, red is a refusal — and red appears twice in 110 seconds. The viewer internalises the rule by the 30-second mark and afterwards understands each frame before reading it. The palette is not applied by the film; it arrives inside the captured pixels, which is why it never drifts.

## 11. Three shot registers, alternating

Typography on flat ground → the app wide → macro on one element (the input field at 0:31, the confidence bar at 1:07, an audit row at 1:30). Changing register every 15–20 seconds is the only reliable way to hold attention over a long runtime. Long promos that sag almost always sag because they showed one scale for a minute straight.

## 12. A cursor that behaves like a person

Bézier paths, a 2–3 px overshoot and correction, deceleration into targets, and a 700 ms hover before `Commit — I disagree`. Because the cursor is driven through the real DOM by Playwright, this is not an effect layered on top — it is what actually happened. That hover before disagreeing is a small piece of acting: you can see a person deciding.

## 13. One trajectory in the whole film

Every move is short and close except one: the decision card arcing off frame at 1:18 and landing as an audit row at 1:22. Precisely because it is the only one, it reads as meaning rather than as an effect. Scarcity creates significance — that takes years to learn and one line of restraint to apply.

## 14. Deterministic timeline, not generation

`renderFrame(t)` gives frame-level control, repeatability and honest 60 fps. One event at 1:07 can be adjusted without touching the other 6599 frames. No AI video generator offers that: there, a revision means a new generation and a different result — which over 110 seconds is the difference between "fix it in an hour" and "make it again".

## 15. Composition rhyme

The film opens on a teal hairline and closes on the same one. Beginning and end meet, and the viewer gets a sense of completeness they usually attribute to "good editing" without being able to name the cause. The cheapest available increase in perceived quality.

## 16. Honesty as a visual device

`Synthetic imaging. No patient data. Ever.` on the end card. `Automatic redaction is not good enough to show anyone.` as a highlighted real status. A disclaimer presented as a feature rather than hidden as a legal footnote. For a product about accountability this is the only tenable position — and it differentiates hard, because nearly every AI promo hides its limitations.

---

## HOW TO USE THIS

1. Get the app running and seeded first — `docker compose up --build`. **Stage A cannot be written against a product that is not running**, and the whole approach depends on it.
2. Hand Part 1 to Claude Design as a single message.
3. Review the first pass **against the acceptance checks only** — not against "do I like it". Run check 1 (provenance) and check 7 (register changes) first; those are where long, UI-heavy films fail.
4. Phrase revisions in timecodes: "the event at 1:07.6 starts 200 ms earlier", never "make it more dynamic".
5. If a shot needs a UI element that was not captured, the fix is a new beat in `capture.mjs` — never a drawn element in the compositor.
