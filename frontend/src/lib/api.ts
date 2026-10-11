/* Thin typed client for the Medly API. */
import type { PhotoAttribution } from "@/components/ui/photo-credit";
import { readLang } from "./i18n";

/**
 * Resolution order, most specific first:
 *   1. window.__MEDLY_API_URL__ — written at container start, so one built
 *      image can point at any backend without a rebuild.
 *   2. VITE_API_URL — baked in at build time, for local `npm run dev`.
 *   3. localhost:8000 — the default the README tells you to run.
 */
const BASE =
  (typeof window !== "undefined" && window.__MEDLY_API_URL__) ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000";

const TOKEN_KEY = "medly.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---------- translation completeness ----------
 * The backend sets `X-Medly-Translation: partial` when any field in a
 * response fell back to English (see app/services/localize.py). Kept as a
 * tiny external store rather than React state because it is written from
 * `request()`, which knows nothing about components; `TranslationNote` reads
 * it through useSyncExternalStore.
 */
let translationPartial = false;
const translationListeners = new Set<() => void>();

function setTranslationPartial(value: boolean) {
  if (translationPartial === value) return;
  translationPartial = value;
  for (const listener of translationListeners) listener();
}

/** Call on navigation: the note belongs to the page that earned it. */
export function resetTranslationStatus() {
  setTranslationPartial(false);
}
export function getTranslationStatus(): boolean {
  return translationPartial;
}
export function subscribeTranslationStatus(listener: () => void): () => void {
  translationListeners.add(listener);
  return () => {
    translationListeners.delete(listener);
  };
}

/** True only on public pages, where a stale token must not trigger a redirect loop. */
function onPublicPage(): boolean {
  return (
    typeof window === "undefined" ||
    window.location.pathname === "/login" ||
    window.location.pathname === "/"
  );
}

/* ---------- session refresh ----------
 * The access token lives 15 minutes. The refresh token is an httpOnly cookie
 * this code never sees: `POST /api/auth/refresh` trades it for a new access
 * token and rotates it. Every fetch therefore sends credentials, so the cookie
 * is stored and sent cross-origin (it is scoped to /api/auth on the server,
 * so it does not ride along on anything else).
 */

/** Required by /refresh and /logout — see CSRF_HEADER in app/routers/auth.py. */
const CSRF_HEADERS = { "X-Medly-CSRF": "1" };

/** A 401 from these means "wrong credentials" or "no session", not "token expired". */
const NO_REFRESH_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
]);

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Get a new access token, once, however many requests ask at the same time.
 *
 * The server rotates the refresh token on every use and treats a second use of
 * the old one as theft — it revokes the whole session. So two concurrent
 * refreshes must never both reach it: within a tab they share one promise, and
 * across tabs a Web Lock serialises them. A tab that waited for the lock
 * checks whether another tab already stored a newer token, and uses that.
 *
 * `staleToken` is the token the failed request was sent with.
 */
export function refreshSession(staleToken: string | null): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(() => exchangeRefreshCookie(staleToken)).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function withRefreshLock(task: () => Promise<boolean>): Promise<boolean> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return task();
  // Held until `task` settles; resolves with its result.
  return await locks.request("medly.refresh", task);
}

async function exchangeRefreshCookie(staleToken: string | null): Promise<boolean> {
  const current = getToken();
  if (current && current !== staleToken) return true;
  try {
    const response = await fetch(`${BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: CSRF_HEADERS,
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { access_token: string };
    setToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

/** The session is over: drop the token and, unless already there, go to sign-in. */
function endSession(): never {
  clearToken();
  if (!onPublicPage()) {
    window.location.assign("/login");
  }
  throw new ApiError(401, "Session expired — please sign in again");
}

async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Every request carries the active display language, so the backend can
  // return article/community/resource/challenge text already translated
  // (and machine-translate + cache it on first request in a new language —
  // see app/services/localize.py). Read fresh each call rather than passed
  // in, so this file does not need to import the language React context.
  headers.set("X-Medly-Lang", readLang());

  const response = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  // Sticky within a page: one partial response is enough to warrant the note,
  // and a later complete response should not clear it.
  if (response.headers.get("X-Medly-Translation") === "partial") {
    setTranslationPartial(true);
  }
  if (response.status === 401) {
    // Usually the access token simply expired: refresh it and replay the
    // request, once. If that fails too, the session is really over — the
    // refresh token expired, was revoked (logout elsewhere, a password
    // change), or the database behind it was reset.
    if (!retried && !NO_REFRESH_PATHS.has(path) && (await refreshSession(token))) {
      return request<T>(path, init, true);
    }
    endSession();
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      /* response had no JSON body */
    }
    throw new ApiError(response.status, String(detail));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/* ---------- streaming ---------- */

export interface StreamHandlers {
  /** One fragment exactly as Gemini produced it. Called many times. */
  onChunk: (text: string) => void;
  /** Generation finished cleanly. */
  onDone: (meta: {
    session_id: string;
    blocked: boolean;
    block_reason?: string;
    risk_level: RiskLevel;
    disclaimer: string;
    model?: string;
  }) => void;
  /** Something failed. `partial` is true when text had already arrived. */
  onError: (detail: string, partial: boolean) => void;
  onStart?: (sessionId: string) => void;
}

/**
 * Millisecond-stamped stream tracing.
 *
 * Off unless you ask for it, so production consoles stay clean:
 *   localStorage.setItem("medly.debug.stream", "1")   // then reload
 *
 * Read the timestamps to place the delay. If "network chunk" lines arrive
 * spread out but "React flush" lines are bunched, the UI is at fault; if the
 * network lines themselves all land at once, nothing before the browser
 * streamed and the problem is upstream.
 */
const streamDebug = () => {
  try {
    return localStorage.getItem("medly.debug.stream") === "1";
  } catch {
    return false;
  }
};

export function traceStream(stage: string, extra = "") {
  if (!streamDebug()) return;
  const now = new Date();
  const stamp = `${now.toLocaleTimeString([], { hour12: false })}.${String(
    now.getMilliseconds()
  ).padStart(3, "0")}`;
  console.log(`[AI-STREAM] ${stamp} ${stage}${extra ? ` ${extra}` : ""}`);
}

/**
 * Consume the SSE stream from `/api/assistant/chat/stream`.
 *
 * `fetch` rather than `EventSource`, because this is a POST and needs the
 * Authorization header — `EventSource` supports neither. Pass `signal` from an
 * AbortController to stop generation; aborting closes the connection, which
 * the server sees and treats as an interruption.
 */
async function streamChat(
  message: string,
  options: ChatOptions,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let received = false;
  const t0 = performance.now();
  const since = () => `+${Math.round(performance.now() - t0)}ms`;
  traceStream("request sent", `-> ${BASE}/api/assistant/chat/stream`);

  const open = (token: string | null) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Medly-Lang": readLang(),
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${BASE}/api/assistant/chat/stream`, {
      method: "POST",
      headers,
      signal,
      credentials: "include",
      body: JSON.stringify({
        message,
        session_id: options.sessionId,
        action: options.action,
        context_kind: options.contextKind,
        context_key: options.contextKey,
        context_note: options.contextNote,
      }),
    });
  };

  const token = getToken();
  let response = await open(token);
  // An expired access token is rejected before the stream opens, so nothing
  // has been generated yet and replaying the request is safe.
  if (response.status === 401 && (await refreshSession(token))) {
    response = await open(getToken());
  }

  traceStream(
    "response headers",
    `${since()} status=${response.status} type=${response.headers.get(
      "content-type"
    )} encoding=${response.headers.get("content-encoding") ?? "none"}`
  );

  if (response.status === 401) endSession();

  // Guard rejections (429, 422, 503) arrive as an ordinary JSON error before
  // the stream opens, so they surface with their real status code.
  if (!response.ok || !response.body) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail ?? detail;
    } catch {
      /* no JSON body */
    }
    throw new ApiError(response.status, String(detail));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      traceStream("network chunk", `${since()} bytes=${value?.byteLength ?? 0}`);
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line. A partial frame stays in the
      // buffer until the rest of it arrives.
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        let event = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(dataLines.join("\n"));
        } catch {
          continue;
        }

        traceStream("parsed frame", `${since()} event=${event}`);

        if (event === "start") handlers.onStart?.(String(data.session_id ?? ""));
        else if (event === "chunk") {
          received = true;
          handlers.onChunk(String(data.text ?? ""));
        } else if (event === "done") {
          handlers.onDone(data as never);
        } else if (event === "error") {
          handlers.onError(String(data.detail ?? "Generation failed"), Boolean(data.partial));
        }
      }
    }
  } finally {
    // Releasing the lock lets the connection close even if we exited early.
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
    void received;
  }
}

/* ---------- virtual patient ---------- */

/** The condition the engine reports. Authored server-side; never computed here. */
export type PatientState =
  | "stable"
  | "improving"
  | "deteriorating"
  | "critical"
  | "recovered"
  | "failed";

export type VpVitals = Partial<{
  hr: number;
  bp: string;
  rr: number;
  spo2: number;
  temp: number;
  gcs: number;
}> &
  Record<string, unknown>;

export interface VpCase {
  slug: string;
  title: string;
  summary: string;
  specialty: string;
  difficulty: string;
  estimated_minutes: number;
  icon: string;
  cover: string;
  patient_name: string;
  patient_age: number;
  patient_sex: string;
  presenting_complaint: string;
  stage_count: number;
  max_score: number;
  active_session_id: number | null;
  completed: boolean;
  /** Condition of the patient in the caller's in-progress run. Empty string
   *  when there is no run, so the card can draw a settled patient instead. */
  active_patient_state: PatientState | "";
}

export interface VpOption {
  key: string;
  label: string;
  detail: string;
}

export interface VpStage {
  key: string;
  kind: string;
  title: string;
  narrative: string;
  patient_line: string;
  clinical_note: string;
  prompt: string;
  is_terminal: boolean;
  outcome: string;
  options: VpOption[];
  /** True when the patient's line was phrased by the model. */
  narrated: boolean;
}

export interface VpSession {
  session_id: number;
  case_slug: string;
  patient_name: string;
  patient_age: number;
  patient_sex: string;
  cover: string;
  status: "in_progress" | "completed" | "failed" | "abandoned";
  patient_state: PatientState;
  vitals: VpVitals;
  score: number;
  max_score: number;
  decisions_made: number;
  passed: boolean;
  outcome: string;
  stage: VpStage;
  disclaimer: string;
  started_at: string;
  completed_at: string | null;
}

export interface VpDecisionResult {
  was_correct: boolean;
  was_harmful: boolean;
  score_delta: number;
  feedback: string;
  patient_state_before: PatientState;
  patient_state_after: PatientState;
  vitals: VpVitals;
  score: number;
  max_score: number;
  finished: boolean;
  outcome: string;
  next_stage: VpStage;
  disclaimer: string;
}

export interface VpDecisionRecord {
  order: number;
  stage_key: string;
  option_label: string;
  was_correct: boolean;
  was_harmful: boolean;
  score_delta: number;
  feedback: string;
}

export interface VpResult {
  session_id: number;
  case_slug: string;
  case_title: string;
  patient_name: string;
  patient_age: number;
  patient_sex: string;
  status: string;
  outcome: string;
  passed: boolean;
  score: number;
  max_score: number;
  patient_state: PatientState;
  correct_diagnosis: string;
  learning_objectives: string;
  debrief: string;
  /** False when Gemini was unavailable and the authored debrief was used. */
  debrief_narrated: boolean;
  decisions: VpDecisionRecord[];
  disclaimer: string;
}

/* ---------- types ---------- */

export type Role = "student" | "instructor" | "admin";
export type RiskLevel = "none" | "low" | "medium" | "high";

export interface Me {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  institution?: string | null;
  year_of_study?: number | null;
  avatar_url: string;
  points: number;
  is_premium: boolean;
  show_on_leaderboard: boolean;
}

export interface CourseSummary {
  id: number;
  slug: string;
  title: string;
  summary: string;
  track: string;
  level: string;
  duration_minutes: number;
  icon: string;
  lesson_count: number;
  enrolled: boolean;
  progress_pct: number;
}

export interface LessonSummary {
  id: number;
  order: number;
  title: string;
  kind: "reading" | "video" | "interactive" | "case";
  duration_minutes: number;
  key_point?: string | null;
  status: "not_started" | "in_progress" | "completed";
}

export interface CourseDetail extends CourseSummary {
  lessons: LessonSummary[];
}

export interface LessonDetail extends LessonSummary {
  body_md: string;
  course_id: number;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  blocked: boolean;
  block_reason?: string | null;
  risk_level: RiskLevel;
  disclaimer: string;
  provider: string;
  audit_event_id?: number | null;
  /** Set only when a hosted model answered, e.g. "gemini-3.5-flash". */
  model?: string | null;
}

/** Follow-ups the server offers under an answer. Wording lives server-side. */
export type QuickAction =
  | "simpler"
  | "deeper"
  | "example"
  | "mcq"
  | "case"
  | "summary"
  | "quiz";

export interface ChatOptions {
  sessionId?: string;
  action?: QuickAction;
  /** Page grounding. The server resolves the real content from these. */
  contextKind?: "article" | "resource" | "challenge";
  contextKey?: string;
  /** On-screen state only the client knows. Capped server-side. */
  contextNote?: string;
}

export interface AuditEvent {
  id: number;
  created_at: string;
  user_id?: number | null;
  user_name?: string | null;
  event_type: string;
  risk_level: RiskLevel;
  ai_model?: string | null;
  ai_output_summary?: string | null;
  confidence?: number | null;
  human_decision?: string | null;
  overridden?: boolean | null;
  blocked: boolean;
  block_reason?: string | null;
  requires_review: boolean;
  disclaimer_shown: boolean;
}

export interface GovernanceSummary {
  total_ai_interactions: number;
  blocked_count: number;
  block_rate: number;
  override_count: number;
  review_count: number;
  override_rate: number;
  low_confidence_count: number;
  disclaimer_coverage: number;
  by_event_type: Record<string, number>;
  by_risk_level: Record<string, number>;
  total_users: number;
  confidence_threshold: number;
  pending_review: number;
}

export interface StandardRule {
  id: string;
  title: string;
  rule: string;
  enforced_by: string;
}

export interface SafetyStandard {
  version: string;
  confidence_threshold: number;
  disclaimer: string;
  rules: StandardRule[];
}

export interface TimeseriesPoint {
  date: string;
  interactions: number;
  blocked: number;
  overrides: number;
}

/* ---------- assessment ---------- */

export interface QuizChoice {
  id: number;
  text: string;
}

export interface QuizQuestion {
  id: number;
  order: number;
  prompt: string;
  /** "single" = one correct choice, "multi" = several. */
  kind: string;
  points: number;
  choices: QuizChoice[];
}

export interface Quiz {
  id: number;
  course_id: number;
  title: string;
  description: string;
  passing_score: number;
  questions: QuizQuestion[];
}

export interface QuestionResult {
  question_id: number;
  correct: boolean;
  correct_choice_ids: number[];
  given_choice_ids: number[];
  explanation: string;
}

export interface QuizResult {
  attempt_id: number;
  score: number;
  passed: boolean;
  passing_score: number;
  band: string;
  /** Non-zero only on the first pass of a given quiz. */
  points_awarded: number;
  total_points: number;
  results: QuestionResult[];
}

export interface Attempt {
  id: number;
  quiz_id: number;
  quiz_title?: string | null;
  score: number;
  passed: boolean;
  submitted_at: string;
}

/* ---------- imaging analysis ---------- */

export type Modality = "xray" | "ct";
export type AnalysisStatus = "pending" | "complete" | "needs_review" | "failed";

export interface Finding {
  label: string;
  confidence: number;
  /** Normalised [x, y, w, h] in 0..1 — overlay at any render size. */
  bbox: [number, number, number, number] | number[];
  description: string;
}

export interface AnalysisJob {
  id: number;
  case_ref: string;
  modality: Modality;
  status: AnalysisStatus;
  student_finding?: string | null;
  findings: Finding[];
  model_name: string;
  model_version: string;
  mean_confidence: number;
  uncertainty_flag: boolean;
  requires_review: boolean;
  final_decision?: string | null;
  agreed_with_ai?: boolean | null;
  disclaimer: string;
  known_limitations: string[];
  created_at: string;
}

/* ---------- feed ---------- */

export interface ArticleImageRefresh {
  slug: string;
  changed: boolean;
  cover: string;
  cover_orientation: "landscape" | "portrait" | "square";
  image: PhotoAttribution | null;
  detail: string;
}

export interface ArticleSummary {
  id: number;
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  author: string;
  author_role: string;
  read_minutes: number;
  cover: string;
  cover_alt: string;
  /** Shape of the cover image, so the card can reserve the right box before it
   *  loads. Stored server-side rather than measured in the browser. */
  cover_orientation: "landscape" | "portrait" | "square";
  /** Attribution and true pixel dimensions when the cover came from a stock
   *  provider. Null for an authored cover. Never carries a credential. */
  image: PhotoAttribution | null;
  published_at: string;
  like_count: number;
  comment_count: number;
  liked: boolean;
  saved: boolean;
}

export interface Comment {
  id: number;
  author: string;
  author_role: string;
  body: string;
  created_at: string;
  mine: boolean;
}

export interface ArticleDetail extends ArticleSummary {
  body_md: string;
  comments: Comment[];
}

/* ---------- library & saved ---------- */

export type SavedType = "article" | "book" | "pdf" | "video";

export interface LibraryResource {
  id: number;
  slug: string;
  kind: "book" | "pdf" | "video";
  title: string;
  author: string;
  description: string;
  rating: number;
  downloads: string;
  duration: string;
  premium: boolean;
  url: string;
  video_url: string;
  /** Videos only. How the source was shot, so the player and the library card
   *  can frame it at its own proportions. */
  orientation: "landscape" | "portrait";
  pdf_url: string;
  cover_hue: number;
  cover: string;
  publisher: string;
  year: number | null;
  pages: number | null;
  level: string;
  topic: string;
  saved: boolean;
}

export interface SavedEntry {
  id: number;
  item_type: SavedType;
  item_key: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  meta: string;
  premium: boolean;
  cover_hue: number;
  cover: string;
  cover_alt: string;
  saved_at: string;
}

/* ---------- communities ---------- */

export interface CommunitySummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  specialty: string;
  icon: string;
  cover: string;
  members: number;
  messages: number;
  joined: boolean;
  owned: boolean;
  created_at: string;
}

export interface CommunityDetail extends CommunitySummary {
  member_names: string[];
  can_post: boolean;
}

export interface CommunityMessage {
  id: number;
  author: string;
  author_role: string;
  body: string;
  created_at: string;
  mine: boolean;
}

export interface CommunityPermissions {
  can_create: boolean;
  is_premium: boolean;
  role: Role;
  reason: string;
}

/* ---------- challenges ---------- */

export interface ChallengeChoice {
  id: number;
  text: string;
}

export interface ChallengeQuestion {
  id: number;
  order: number;
  prompt: string;
  points: number;
  choices: ChallengeChoice[];
  image_seed: string | null;
  image_alt: string;
  image_modality: string;
  answered: boolean;
  correct: boolean | null;
  chosen_choice_id: number | null;
  correct_choice_id: number | null;
  explanation: string | null;
}

export interface ChallengeSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  topic: string;
  icon: string;
  cover: string;
  difficulty: "easy" | "medium" | "hard" | string;
  points: number;
  question_count: number;
  participants: number;
  ends_at: string | null;
  joined: boolean;
  answered_count: number;
  earned_points: number;
  completed: boolean;
}

export interface ChallengeDetail extends ChallengeSummary {
  questions: ChallengeQuestion[];
}

export interface AnswerResult {
  question_id: number;
  correct: boolean;
  correct_choice_id: number;
  explanation: string;
  points_awarded: number;
  already_answered: boolean;
  earned_points: number;
  answered_count: number;
  question_count: number;
  completed: boolean;
  total_points: number;
  rank: number;
  new_badges: string[];
}

/* ---------- profile ---------- */

export interface Profile {
  id: number;
  name: string;
  handle: string;
  email: string;
  role: Role;
  institution: string;
  year_of_study: number | null;
  avatar_url: string;
  is_premium: boolean;
  points: number;
  streak_days: number;
  longest_streak: number;
  rank: number;
  total_users: number;
  badge_count: number;
  community_count: number;
  saved_count: number;
  lessons_completed: number;
  challenges_completed: number;
  comments: number;
  joined_at: string;
}

export interface BadgeState {
  key: string;
  icon: string;
  label: string;
  hint: string;
  earned: boolean;
  earned_at: string | null;
}

export interface LeaderboardRow {
  rank: number;
  user_id: number;
  name: string;
  institution: string;
  points: number;
  avatar_url: string;
  you: boolean;
}

export interface ActivityRow {
  text: string;
  detail: string;
  points: number | null;
  at: string;
}

/* ---------- casebook ---------- */

export interface CaseImage {
  id: number;
  caption: string;
  view: string;
  render_seed: string;
  anonymization_status: "pending" | "auto_redacted" | "verified" | string;
  redacted_fields: string[];
  review_notes: string;
  verified_by_name: string | null;
  verified_at: string | null;
}

export interface CaseSummary {
  id: number;
  case_ref: string;
  title: string;
  modality: Modality;
  body_region: string;
  patient_age_band: string;
  patient_sex: string;
  clinical_context: string;
  difficulty: string;
  source: string;
  published: boolean;
  author_name: string;
  image_count: number;
  pending_verification: number;
  created_at: string;
  mine: boolean;
}

export interface CaseDetail extends CaseSummary {
  teaching_points: string;
  findings_summary: string;
  images: CaseImage[];
  residual_risks: string[];
}

export interface CasebookPermissions {
  can_author: boolean;
  role: Role;
  reason: string;
}

/* ---------- endpoints ---------- */

export const api = {
  health: () => request<{ status: string }>("/api/health"),

  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      body,
      // The response sets the refresh cookie; cross-origin, it is only
      // stored when the request was made with credentials.
      credentials: "include",
    });
    if (!response.ok) throw new ApiError(response.status, "Incorrect email or password");
    const data = (await response.json()) as { access_token: string };
    setToken(data.access_token);
    return data;
  },

  register: async (payload: {
    email: string;
    password: string;
    full_name: string;
    institution?: string;
    year_of_study?: number;
  }) => {
    const data = await request<{ access_token: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setToken(data.access_token);
    return data;
  },

  /** Revoke this device's refresh token on the server, then forget the access token. */
  logout: async () => {
    try {
      await fetch(`${BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: CSRF_HEADERS,
      });
    } catch {
      /* offline: still sign out locally — the cookie expires on its own */
    } finally {
      clearToken();
    }
  },

  me: () => request<Me>("/api/auth/me"),

  /* settings */
  updateMe: (payload: {
    full_name?: string;
    institution?: string;
    year_of_study?: number;
    avatar_url?: string;
    show_on_leaderboard?: boolean;
  }) => request<Me>("/api/auth/me", { method: "PATCH", body: JSON.stringify(payload) }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  clearAssistantHistory: () =>
    request<void>("/api/assistant/history", { method: "DELETE" }),

  courses: () => request<CourseSummary[]>("/api/courses"),
  course: (slug: string) => request<CourseDetail>(`/api/courses/${slug}`),
  enroll: (slug: string) =>
    request<CourseSummary>(`/api/courses/${slug}/enroll`, { method: "POST" }),
  lesson: (id: number) => request<LessonDetail>(`/api/courses/lessons/${id}`),
  completeLesson: (id: number) =>
    request<LessonSummary>(`/api/courses/lessons/${id}/complete`, { method: "POST" }),

  chat: (message: string, options: string | ChatOptions = {}) => {
    // The second argument used to be a bare session id; both forms still work.
    const opts: ChatOptions = typeof options === "string" ? { sessionId: options } : options;
    return request<ChatResponse>("/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        session_id: opts.sessionId,
        action: opts.action,
        context_kind: opts.contextKind,
        context_key: opts.contextKey,
        context_note: opts.contextNote,
      }),
    });
  },
  chatStream: streamChat,
  suggestions: () => request<string[]>("/api/assistant/suggestions"),

  /* virtual patient */
  vpCases: () => request<VpCase[]>("/api/virtual-patient/cases"),
  vpCase: (slug: string) => request<VpCase>(`/api/virtual-patient/cases/${slug}`),
  vpStart: (slug: string) =>
    request<VpSession>(`/api/virtual-patient/cases/${slug}/start`, { method: "POST" }),
  vpSession: (id: number) => request<VpSession>(`/api/virtual-patient/sessions/${id}`),
  vpDecide: (id: number, stage_key: string, option_key: string) =>
    request<VpDecisionResult>(`/api/virtual-patient/sessions/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ stage_key, option_key }),
    }),
  vpAbandon: (id: number) =>
    request<VpSession>(`/api/virtual-patient/sessions/${id}/abandon`, { method: "POST" }),
  vpResult: (id: number) =>
    request<VpResult>(`/api/virtual-patient/sessions/${id}/result`),

  audit: (params: Record<string, string | number | boolean> = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    return request<AuditEvent[]>(`/api/governance/audit${query ? `?${query}` : ""}`);
  },
  summary: () => request<GovernanceSummary>("/api/governance/summary"),
  standard: () => request<SafetyStandard>("/api/governance/standard"),
  timeseries: (days = 14) =>
    request<TimeseriesPoint[]>(`/api/governance/timeseries?days=${days}`),
  reviewEvent: (id: number) =>
    request<AuditEvent>(`/api/governance/audit/${id}/review`, { method: "POST" }),

  /* assessment */
  quizzesForCourse: (slug: string) => request<Quiz[]>(`/api/quizzes/course/${slug}`),
  quiz: (id: number) => request<Quiz>(`/api/quizzes/${id}`),
  submitQuiz: (id: number, answers: Record<number, number[]>) =>
    request<QuizResult>(`/api/quizzes/${id}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),
  myAttempts: () => request<Attempt[]>("/api/quizzes/attempts/me"),

  /* imaging — the four steps must be called in this order; the server enforces it */
  createCase: (case_ref: string, modality: Modality = "xray") =>
    request<AnalysisJob>("/api/analysis/cases", {
      method: "POST",
      body: JSON.stringify({ case_ref, modality }),
    }),
  myCases: () => request<AnalysisJob[]>("/api/analysis/cases"),
  submitReading: (jobId: number, finding: string) =>
    request<AnalysisJob>(`/api/analysis/${jobId}/my-reading`, {
      method: "POST",
      body: JSON.stringify({ finding }),
    }),
  analyze: (jobId: number) =>
    request<AnalysisJob>(`/api/analysis/${jobId}/analyze`, { method: "POST" }),
  decide: (jobId: number, final_decision: string, agreed_with_ai: boolean) =>
    request<AnalysisJob>(`/api/analysis/${jobId}/decide`, {
      method: "POST",
      body: JSON.stringify({ final_decision, agreed_with_ai }),
    }),

  /* feed — `q` searches the article body, not only the title */
  articles: (params: { q?: string; tag?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.tag && params.tag !== "All") query.set("tag", params.tag);
    const suffix = query.toString();
    return request<ArticleSummary[]>(`/api/feed/articles${suffix ? `?${suffix}` : ""}`);
  },
  article: (slug: string) => request<ArticleDetail>(`/api/feed/articles/${slug}`),
  addComment: (slug: string, body: string) =>
    request<Comment>(`/api/feed/articles/${slug}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  deleteComment: (id: number) =>
    request<void>(`/api/feed/comments/${id}`, { method: "DELETE" }),
  toggleLike: (slug: string) =>
    request<ArticleSummary>(`/api/feed/articles/${slug}/like`, { method: "POST" }),

  /* library + saved */
  /** Staff only. Replaces the article's stored stock photo with a fresh one. */
  regenerateArticleImage: (slug: string) =>
    request<ArticleImageRefresh>(`/api/feed/articles/${slug}/image/regenerate`, {
      method: "POST",
    }),
  /** Staff only. Drops the stock photo and restores the authored cover. */
  dropArticleImage: (slug: string) =>
    request<ArticleImageRefresh>(`/api/feed/articles/${slug}/image`, { method: "DELETE" }),

  resources: (params: { q?: string; kind?: string; level?: string; topic?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.kind) query.set("kind", params.kind);
    if (params.level) query.set("level", params.level);
    if (params.topic) query.set("topic", params.topic);
    const suffix = query.toString();
    return request<LibraryResource[]>(`/api/resources${suffix ? `?${suffix}` : ""}`);
  },
  saved: (itemType?: SavedType | "all") =>
    request<SavedEntry[]>(`/api/saved${itemType && itemType !== "all" ? `?item_type=${itemType}` : ""}`),
  save: (item_type: SavedType, item_key: string) =>
    request<SavedEntry>("/api/saved", {
      method: "POST",
      body: JSON.stringify({ item_type, item_key }),
    }),
  unsave: (item_type: SavedType, item_key: string) =>
    request<void>(
      `/api/saved?item_type=${encodeURIComponent(item_type)}&item_key=${encodeURIComponent(item_key)}`,
      { method: "DELETE" }
    ),
  savedCounts: () => request<Record<string, number>>("/api/saved/counts"),

  /* communities */
  communities: (params: { q?: string; filter?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set("q", params.q);
    if (params.filter && params.filter !== "All") query.set("filter", params.filter);
    const suffix = query.toString();
    return request<CommunitySummary[]>(`/api/communities${suffix ? `?${suffix}` : ""}`);
  },
  myCommunities: () => request<CommunitySummary[]>("/api/communities/mine"),
  communityPermissions: () =>
    request<CommunityPermissions>("/api/communities/permissions"),
  community: (slug: string) => request<CommunityDetail>(`/api/communities/${slug}`),
  createCommunity: (payload: {
    name: string;
    description: string;
    specialty?: string;
    emoji?: string;
  }) =>
    request<CommunitySummary>("/api/communities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  joinCommunity: (slug: string) =>
    request<CommunitySummary>(`/api/communities/${slug}/join`, { method: "POST" }),
  leaveCommunity: (slug: string) =>
    request<CommunitySummary>(`/api/communities/${slug}/leave`, { method: "POST" }),
  communityMessages: (slug: string) =>
    request<CommunityMessage[]>(`/api/communities/${slug}/messages`),
  postCommunityMessage: (slug: string, body: string) =>
    request<CommunityMessage>(`/api/communities/${slug}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  /* challenges */
  challenges: () => request<ChallengeSummary[]>("/api/challenges"),
  challenge: (slug: string) => request<ChallengeDetail>(`/api/challenges/${slug}`),
  joinChallenge: (slug: string) =>
    request<ChallengeDetail>(`/api/challenges/${slug}/join`, { method: "POST" }),
  answerChallenge: (slug: string, question_id: number, choice_id: number) =>
    request<AnswerResult>(`/api/challenges/${slug}/answer`, {
      method: "POST",
      body: JSON.stringify({ question_id, choice_id }),
    }),

  /* profile */
  profile: () => request<Profile>("/api/profile"),
  badges: () => request<BadgeState[]>("/api/profile/badges"),
  leaderboard: (limit = 25) =>
    request<LeaderboardRow[]>(`/api/profile/leaderboard?limit=${limit}`),
  activity: (limit = 12) => request<ActivityRow[]>(`/api/profile/activity?limit=${limit}`),
  activatePremium: () => request<Profile>("/api/profile/premium", { method: "POST" }),
  cancelPremium: () => request<Profile>("/api/profile/premium", { method: "DELETE" }),

  /* casebook — teacher-authored imaging case references */
  casebookPermissions: () => request<CasebookPermissions>("/api/casebook/permissions"),
  cases: () => request<CaseSummary[]>("/api/casebook/cases"),
  caseDetail: (id: number) => request<CaseDetail>(`/api/casebook/cases/${id}`),
  createCaseReference: (payload: {
    case_ref: string;
    title: string;
    modality: Modality;
    body_region?: string;
    patient_age_band?: string;
    patient_sex?: string;
    clinical_context?: string;
    teaching_points?: string;
    findings_summary?: string;
    difficulty?: string;
  }) =>
    request<CaseDetail>("/api/casebook/cases", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addCaseImage: (
    caseId: number,
    payload: { caption: string; view: string; metadata: Record<string, string>; overlay_text: string }
  ) =>
    request<CaseImage>(`/api/casebook/cases/${caseId}/images`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyCaseImage: (imageId: number) =>
    request<CaseImage>(`/api/casebook/images/${imageId}/verify`, { method: "POST" }),
  publishCase: (caseId: number) =>
    request<CaseDetail>(`/api/casebook/cases/${caseId}/publish`, { method: "POST" }),
  unpublishCase: (caseId: number) =>
    request<CaseDetail>(`/api/casebook/cases/${caseId}/unpublish`, { method: "POST" }),
};
