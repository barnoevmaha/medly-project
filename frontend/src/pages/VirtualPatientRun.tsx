import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Award, BookOpen, ClipboardList, Loader2,
  RotateCcw, ShieldAlert, Sparkles, Stethoscope, TriangleAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Markdown } from "@/components/ui/markdown";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { expressionFor } from "@/components/virtual-patient/PatientAvatar";
import { PatientFigure } from "@/components/virtual-patient/PatientFigure";
import { ConditionMeter } from "@/components/virtual-patient/ConditionMeter";
import { DecisionList } from "@/components/virtual-patient/DecisionList";
import {
  ApiError,
  api,
  type VpDecisionResult,
  type VpResult,
  type VpSession,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A run through one case: introduction, decisions, outcome, debrief.
 *
 * The server owns everything that matters. This screen holds no answer key,
 * decides no verdicts, and never advances a stage on its own — it renders what
 * `/decision` returns. A stale or duplicated submit is refused by the backend
 * with a 409, which is why the button locks on the first click rather than
 * relying on the request being fast.
 */

interface Bubble {
  id: number;
  speaker: "patient" | "clinical";
  text: string;
  /** Patient lines phrased by the model are marked, quietly and honestly. */
  narrated?: boolean;
}

let bubbleId = 1;

export default function VirtualPatientRun() {
  const { sessionId = "" } = useParams();
  const id = Number(sessionId);
  const toast = useToast();
  const { t, lang } = useLanguage();

  const [session, setSession] = useState<VpSession | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<VpDecisionResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [result, setResult] = useState<VpResult | null>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const transcriptRef = useRef<HTMLDivElement>(null);
  // Guards a double click landing two requests before the first returns.
  const inFlight = useRef(false);
  /* The stage the student is answering. Captured on submit because the
     response replaces `session.stage` with whatever comes next. */
  const answeredRef = useRef<{ options: VpSession["stage"]["options"]; prompt: string }>({
    options: [],
    prompt: "",
  });

  const pushStage = useCallback((stage: VpSession["stage"]) => {
    setBubbles((prev) => {
      const next = [...prev];
      if (stage.narrative) {
        next.push({ id: bubbleId++, speaker: "clinical", text: stage.narrative });
      }
      if (stage.patient_line) {
        next.push({
          id: bubbleId++,
          speaker: "patient",
          text: stage.patient_line,
          narrated: stage.narrated,
        });
      }
      if (stage.clinical_note) {
        next.push({ id: bubbleId++, speaker: "clinical", text: stage.clinical_note });
      }
      return next;
    });
  }, []);

  /* Load the run the URL names. Reloading the page resumes exactly where the
     server says the student is — the client keeps no authoritative state. */
  const begin = useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) {
      setError(t("virtualPatient.sessionInvalid"));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const current = await api.vpSession(id);
      setSession(current);
      setBubbles([]);
      bubbleId = 1;
      pushStage(current.stage);
      setVerdict(null);
      setSelected(null);
      setError(null);
      // A finished run goes straight to its result rather than replaying.
      if (current.status !== "in_progress") {
        setResult(await api.vpResult(current.session_id));
      } else {
        setResult(null);
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 404
          ? t("virtualPatient.sessionGone")
          : e instanceof Error
            ? e.message
            : t("virtualPatient.couldNotOpenSession")
      );
    } finally {
      setLoading(false);
    }
  }, [id, pushStage]);

  /* Reload when the language changes, so the case switches with the UI. The
     stored translation is read; the run is never restarted and no progress is
     lost — the server owns the stage, and it does not care what language the
     student is reading in.

     Not while feedback is on screen, though. The server advanced the stage the
     moment the decision was submitted, so reloading mid-verdict would skip the
     student straight past the explanation they were reading. The switch is
     held until they press continue. */
  const loadedLang = useRef(lang);
  const langChangedMidVerdict = useRef(false);

  useEffect(() => {
    if (loadedLang.current === lang) return;
    if (verdict) {
      langChangedMidVerdict.current = true;
      return;
    }
    loadedLang.current = lang;
    void begin();
  }, [lang, verdict, begin]);

  useEffect(() => {
    void begin();
  }, [begin]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, verdict]);

  async function choose(optionKey: string) {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    answeredRef.current = {
      options: session.stage.options,
      prompt: session.stage.prompt,
    };
    setSelected(optionKey);
    setBusy(true);

    try {
      const outcome = await api.vpDecide(
        session.session_id,
        session.stage.key,
        optionKey
      );
      setVerdict(outcome);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              patient_state: outcome.patient_state_after,
              vitals: outcome.vitals,
              score: outcome.score,
              decisions_made: prev.decisions_made + 1,
              status: outcome.finished
                ? outcome.patient_state_after === "failed"
                  ? "failed"
                  : "completed"
                : prev.status,
              stage: outcome.next_stage,
            }
          : prev
      );
    } catch (e) {
      // A refused move must not leave the UI locked on a choice that never
      // happened, so the selection is rolled back.
      setSelected(null);
      if (e instanceof ApiError && e.status === 409) {
        toast(t("virtualPatient.staleMove"), "error");
        void begin();
      } else if (e instanceof ApiError && e.status === 404) {
        setError(t("virtualPatient.sessionGone"));
      } else {
        toast(
          e instanceof Error ? e.message : t("virtualPatient.couldNotSubmit"),
          "error"
        );
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  /** Move on after reading the feedback. Purely a client-side reveal. */
  function advance() {
    if (!verdict) return;
    // A language switch held back while the feedback was up is applied now.
    if (langChangedMidVerdict.current) {
      langChangedMidVerdict.current = false;
      loadedLang.current = lang;
      setVerdict(null);
      setSelected(null);
      void begin();
      return;
    }
    pushStage(verdict.next_stage);
    setVerdict(null);
    setSelected(null);
    if (verdict.finished) void openResult();
  }

  async function openResult() {
    if (!session) return;
    setLoadingResult(true);
    try {
      setResult(await api.vpResult(session.session_id));
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t("virtualPatient.couldNotLoadDebrief"),
        "error"
      );
    } finally {
      setLoadingResult(false);
    }
  }

  if (loading) return <LoadingState label={t("virtualPatient.loadingCase")} />;

  if (error || !session) {
    return (
      <ErrorState
        title={t("virtualPatient.couldNotOpenCase")}
        message={error ?? undefined}
        onRetry={() => void begin()}
      />
    );
  }

  const stage = session.stage;
  const total = Math.max(1, session.max_score);
  const stageNumber = session.decisions_made + 1;

  /* `session.stage` is already the *next* stage once a decision has been
     submitted, so while feedback is showing the list must keep rendering the
     stage that was just answered. */
  const decisionOptions = verdict ? answeredRef.current.options : stage.options;
  const decisionPrompt =
    (verdict ? answeredRef.current.prompt : stage.prompt) ||
    t("virtualPatient.defaultPrompt");

  // ----------------------------------------------------------------- result
  if (result) {
    return <ResultScreen result={result} loading={loadingResult} caseSlug={result.case_slug} />;
  }

  return (
    <>
      <Link
        to="/virtual-patient"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("virtualPatient.title")}
      </Link>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ------------------------------- patient panel ------------------ */}
        <aside className="space-y-4">
          <Card className="p-5 text-center">
            <PatientFigure
              cover={session.cover}
              age={session.patient_age}
              sex={session.patient_sex}
              expression={expressionFor(session.patient_state)}
              name={session.patient_name}
              size={168}
              className="mx-auto"
            />
            <ConditionMeter
              state={session.patient_state}
              vitals={session.vitals}
              className="mt-4 text-left"
            />
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("virtualPatient.decisionNumber", { n: stageNumber })}
              </span>
              <span className="font-display font-bold">
                {session.score}
                <span className="text-xs font-normal text-muted-foreground">
                  {" "}/ {total}
                </span>
              </span>
            </div>
            <Progress className="mt-2" value={(session.score / total) * 100} />
            <p className="mt-2 text-xs text-muted-foreground">
              {t("virtualPatient.pointsSoFar")}
            </p>
          </Card>
        </aside>

        {/* ------------------------------- transcript + decision ---------- */}
        <div className="min-w-0 space-y-5">
          <Card className="flex max-h-[46vh] flex-col overflow-hidden p-0">
            <header className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Stethoscope className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="font-display text-sm font-bold">{stage.title}</h2>
              <Badge variant="muted" className="ml-auto capitalize">
                {stage.kind}
              </Badge>
            </header>

            <div
              ref={transcriptRef}
              className="flex-1 space-y-3 overflow-y-auto p-5"
              role="log"
              aria-live="polite"
              aria-label={t("virtualPatient.transcript")}
            >
              {bubbles.map((bubble) =>
                bubble.speaker === "patient" ? (
                  <div key={bubble.id} className="flex gap-3 vp-bubble">
                    <PatientFigure
                      age={session.patient_age}
                      sex={session.patient_sex}
                      expression={expressionFor(session.patient_state)}
                      size={40}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 max-w-[85%]">
                      <div className="rounded-2xl rounded-tl-sm border border-border bg-muted/50 px-4 py-2.5 text-sm leading-relaxed">
                        {bubble.text}
                      </div>
                      {bubble.narrated && (
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                          {t("virtualPatient.narratedNote")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    key={bubble.id}
                    className="rounded-xl border-l-2 border-primary/40 bg-primary/5 px-4 py-2.5 text-sm leading-relaxed text-muted-foreground vp-bubble"
                  >
                    {bubble.text}
                  </div>
                )
              )}
            </div>
          </Card>

          {/* feedback on the last decision */}
          {verdict && (
            <Card
              className={cn(
                "p-5 animate-fade-up",
                verdict.was_correct
                  ? "border-success/40 bg-success/5"
                  : "border-warning/40 bg-warning/5"
              )}
            >
              <div className="flex items-start gap-3">
                {verdict.was_correct ? (
                  <Award className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold">
                    {verdict.was_correct
                      ? t("virtualPatient.correct")
                      : verdict.was_harmful
                        ? t("virtualPatient.harmed")
                        : t("virtualPatient.notTheBest")}
                    {verdict.score_delta > 0 && (
                      <span className="ml-2 text-sm font-medium text-success">
                        +{verdict.score_delta}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{verdict.feedback}</p>
                  {verdict.patient_state_before !== verdict.patient_state_after && (
                    <p className="mt-2 text-xs font-medium">
                      {t("virtualPatient.conditionChange", {
                        before: verdict.patient_state_before,
                        after: verdict.patient_state_after,
                      })}
                    </p>
                  )}
                  <Button className="mt-4" size="sm" onClick={advance}>
                    {verdict.finished ? t("virtualPatient.seeResult") : t("common.continue")}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* The decision stays on screen after answering, with the chosen
              option marked, so the feedback above reads against it. */}
          {decisionOptions.length > 0 && (
            <Card className="p-5">
              <DecisionList
                prompt={decisionPrompt}
                options={decisionOptions}
                selectedKey={selected}
                verdict={
                  verdict
                    ? { correct: verdict.was_correct, harmful: verdict.was_harmful }
                    : null
                }
                busy={busy}
                disabled={Boolean(verdict)}
                onChoose={(key) => void choose(key)}
              />
            </Card>
          )}

          {!verdict && stage.is_terminal && (
            <Card className="p-5 text-center">
              <p className="text-sm text-muted-foreground">
                {t("virtualPatient.caseEnded")}
              </p>
              <Button className="mt-3" onClick={() => void openResult()} disabled={loadingResult}>
                {loadingResult && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("virtualPatient.seeResult")}
              </Button>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground">{session.disclaimer}</p>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- result

function ResultScreen({
  result,
  loading,
  caseSlug,
}: {
  result: VpResult;
  loading: boolean;
  caseSlug: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useLanguage();
  const [replaying, setReplaying] = useState(false);

  async function replay() {
    setReplaying(true);
    try {
      const fresh = await api.vpStart(caseSlug);
      navigate(`/virtual-patient/session/${fresh.session_id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("virtualPatient.couldNotStart"), "error");
      setReplaying(false);
    }
  }

  const correct = result.decisions.filter((d) => d.was_correct).length;
  const harmful = result.decisions.filter((d) => d.was_harmful).length;
  const total = result.decisions.length || 1;

  // Two scores rather than one: a student can reason well and still harm a
  // patient, and the two failures need naming separately.
  const reasoning = Math.round((correct / total) * 100);
  const safety = Math.round(((total - harmful) / total) * 100);
  const survived = result.patient_state !== "failed";

  return (
    <>
      <Link
        to="/virtual-patient"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("virtualPatient.title")}
      </Link>

      <Card className="mb-5 p-6 shadow-medium md:p-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <PatientFigure
            expression={expressionFor(result.patient_state)}
            age={result.patient_age}
            sex={result.patient_sex}
            name={result.patient_name}
            size={140}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <Badge variant={result.passed ? "success" : "warning"}>
                {result.passed ? t("virtualPatient.passed") : t("virtualPatient.didNotPass")}
              </Badge>
              <Badge variant={survived ? "muted" : "accent"}>
                {survived ? t("virtualPatient.patientSurvived") : t("virtualPatient.patientDied")}
              </Badge>
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold md:text-3xl">
              {result.case_title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("virtualPatient.finalCondition", { state: result.patient_state })}
            </p>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: t("virtualPatient.score"), value: `${result.score}/${result.max_score}` },
                { label: t("virtualPatient.clinicalReasoning"), value: `${reasoning}%` },
                { label: t("virtualPatient.patientSafety"), value: `${safety}%` },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-border p-3">
                  <div className="font-display text-xl font-bold">{stat.value}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="mb-5 p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
          {t("virtualPatient.yourDecisions")}
        </h2>
        <ol className="mt-4 space-y-3">
          {result.decisions.map((decision) => (
            <li
              key={decision.order}
              className={cn(
                "rounded-xl border p-4",
                decision.was_correct
                  ? "border-success/30 bg-success/5"
                  : "border-warning/30 bg-warning/5"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-bold">
                  {decision.order}. {decision.option_label}
                </span>
                <Badge variant={decision.was_correct ? "success" : "warning"}>
                  {decision.was_correct
                    ? t("virtualPatient.correct")
                    : decision.was_harmful
                      ? t("virtualPatient.harmful")
                      : t("virtualPatient.notIdeal")}
                </Badge>
                {decision.score_delta > 0 && (
                  <span className="text-xs text-muted-foreground">
                    +{decision.score_delta}
                  </span>
                )}
              </div>
              {decision.feedback && (
                <p className="mt-1.5 text-sm text-muted-foreground">{decision.feedback}</p>
              )}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mb-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("virtualPatient.debrief")}
          </h2>
          {/* Honest about provenance rather than implying a model wrote it. */}
          <Badge variant="muted">
            {result.debrief_narrated
              ? t("virtualPatient.debriefWritten")
              : t("virtualPatient.debriefFromNotes")}
          </Badge>
        </div>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("virtualPatient.debriefLoading")}
          </div>
        ) : (
          <div className="mt-4">
            <Markdown>{result.debrief}</Markdown>
          </div>
        )}

        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("virtualPatient.diagnosisHeading")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{result.correct_diagnosis}</p>
          {result.learning_objectives && (
            <p className="mt-2 text-xs text-muted-foreground">
              {result.learning_objectives}
            </p>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void replay()} disabled={replaying}>
          {replaying ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          )}
          {t("virtualPatient.askAgain")}
        </Button>
        <Link to="/virtual-patient">
          <Button variant="outline">{t("virtualPatient.backToCases")}</Button>
        </Link>
      </div>

      <p className="mt-5 flex items-start gap-2 text-center text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        {result.disclaimer}
      </p>
    </>
  );
}
