import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Check, Eye, EyeOff, Loader2, Plus, Scan, ShieldAlert,
  ThumbsDown, ThumbsUp, UserRound,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { FilmViewer } from "@/components/imaging/FilmViewer";
import { ImagingTabs } from "@/components/imaging/ImagingTabs";
import { ApiError, api, type AnalysisJob, type CaseSummary, type Me, type Modality } from "@/lib/api";

const STEPS = ["Case", "Your reading", "Model output", "Your decision"] as const;

function stepOf(job: AnalysisJob | null): number {
  if (!job) return 0;
  if (job.final_decision) return 3;
  if (job.status !== "pending") return 2;
  if (job.student_finding) return 1;
  return 0;
}

/**
 * The anti-automation-bias workbench.
 *
 * The server enforces the order — `POST /analyze` returns 409 until a reading
 * exists. The UI mirrors that rather than implementing its own version of it,
 * so the two cannot drift apart.
 */
export default function Imaging() {
  const [me, setMe] = useState<Me | null>(null);
  const [cases, setCases] = useState<AnalysisJob[]>([]);
  const [job, setJob] = useState<AnalysisJob | null>(null);

  const [references, setReferences] = useState<CaseSummary[]>([]);
  const [caseRef, setCaseRef] = useState("");
  const [modality, setModality] = useState<Modality>("xray");
  const [reading, setReading] = useState("");
  const [decision, setDecision] = useState("");
  const [showLimitations, setShowLimitations] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);

  useEffect(() => {
    Promise.all([api.me(), api.myCases(), api.cases().catch(() => [])])
      .then(([user, list, published]) => {
        setMe(user);
        setCases(list);
        setReferences(published.filter((item) => item.published).slice(0, 6));
        if (list.length) setJob(list[0]);
      })
      .catch((e) => setError({ status: 0, message: e instanceof Error ? e.message : "Load failed" }))
      .finally(() => setLoading(false));
  }, []);

  function fail(e: unknown) {
    if (e instanceof ApiError) setError({ status: e.status, message: e.message });
    else setError({ status: 0, message: e instanceof Error ? e.message : "Something went wrong" });
  }

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      fail(e);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function newCase(e: React.FormEvent) {
    e.preventDefault();
    const ref = caseRef.trim() || `CXR-${Math.floor(1000 + Math.random() * 9000)}`;
    const created = await run(() => api.createCase(ref, modality));
    if (created) {
      setCases((prev) => [created, ...prev]);
      setJob(created);
      setCaseRef("");
      setReading("");
      setDecision("");
    }
  }

  function select(next: AnalysisJob) {
    setJob(next);
    setReading("");
    setDecision(next.final_decision ?? "");
    setError(null);
    setShowLimitations(false);
  }

  function replace(updated: AnalysisJob) {
    setJob(updated);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  async function saveReading() {
    if (!job || !reading.trim()) return;
    const updated = await run(() => api.submitReading(job.id, reading));
    if (updated) replace(updated);
  }

  async function analyze() {
    if (!job) return;
    const updated = await run(() => api.analyze(job.id));
    if (updated) replace(updated);
  }

  async function decide(agreed: boolean) {
    if (!job || !decision.trim()) return;
    const updated = await run(() => api.decide(job.id, decision, agreed));
    if (updated) {
      replace(updated);
      setMe(await api.me().catch(() => me));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading workbench…
      </div>
    );
  }

  const step = stepOf(job);

  return (
    <>
      <PageHeader
        title="Imaging workbench"
        subtitle="Read the film yourself first. Only then does the model speak."
      />

      <ImagingTabs />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* ---------------- case list ---------------- */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-display font-bold">New case</h3>
            <form onSubmit={newCase} className="mt-3 space-y-3">
              <Input
                value={caseRef}
                onChange={(e) => setCaseRef(e.target.value)}
                placeholder="Case reference, e.g. CXR-1042"
              />
              <div className="flex gap-2">
                {(["xray", "ct"] as Modality[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModality(m)}
                    className={`flex-1 rounded-xl border p-2 text-sm font-medium transition-colors ${
                      modality === m
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {m === "xray" ? "X-ray" : "CT"}
                  </button>
                ))}
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                <Plus className="h-4 w-4" />
                Create case
              </Button>
              <p className="text-xs text-muted-foreground">
                Findings are simulated and seeded from the reference, so the same reference
                always produces the same case.
              </p>
            </form>

            {references.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Published case references
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {references.map((reference) => (
                    <button
                      key={reference.id}
                      type="button"
                      onClick={() => {
                        setCaseRef(reference.case_ref);
                        setModality(reference.modality);
                      }}
                      className="rounded-full border border-border px-2.5 py-1 text-xs transition-colors hover:bg-muted"
                      title={reference.title}
                    >
                      {reference.case_ref}
                    </button>
                  ))}
                </div>
                <Link
                  to="/imaging/cases"
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                >
                  Browse all case references
                </Link>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-bold">Your cases</h3>
            {cases.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {cases.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => select(c)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left text-sm transition-colors ${
                        job?.id === c.id ? "bg-primary/10" : "hover:bg-muted"
                      }`}
                    >
                      <span>
                        <span className="font-medium">{c.case_ref}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {c.modality.toUpperCase()} · step {stepOf(c) + 1} of 4
                        </span>
                      </span>
                      {c.final_decision ? (
                        <Check className="h-4 w-4 shrink-0 text-success" />
                      ) : c.requires_review ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------------- workflow ---------------- */}
        {!job ? (
          <Card className="flex flex-col items-center justify-center p-12 text-center">
            <Scan className="h-8 w-8 text-muted-foreground" />
            <h3 className="mt-4 font-display text-lg font-bold">No case open</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create a case to begin. The workflow has four steps and the server refuses to
              let you skip any of them.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* stepper */}
            <Card className="p-4">
              <ol className="flex flex-wrap gap-x-2 gap-y-2">
                {STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold ${
                        i < step
                          ? "bg-success/15 text-success"
                          : i === step
                          ? "gradient-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        i === step ? "font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                    {i < STEPS.length - 1 && (
                      <span className="mx-1 hidden h-px w-6 bg-border sm:block" />
                    )}
                  </li>
                ))}
              </ol>
            </Card>

            {/* errors — the 403 and the 409 are the demo, so they get real estate */}
            {error && (
              <Card
                className={`p-5 ${
                  error.status === 403
                    ? "border-warning/40 bg-warning/5"
                    : "border-destructive/40 bg-destructive/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    className={`mt-0.5 h-5 w-5 shrink-0 ${
                      error.status === 403 ? "text-warning" : "text-destructive"
                    }`}
                  />
                  <div>
                    <h3 className="font-display font-bold">
                      {error.status === 403 && "Blocked — HTTP 403, not permitted"}
                      {error.status === 409 && "Blocked — HTTP 409, wrong order"}
                      {error.status !== 403 && error.status !== 409 && "Request failed"}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                    {(error.status === 403 || error.status === 409) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        This came from the API, not from this page. The rule holds for any
                        client that talks to it.
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-display font-bold">{job.case_ref}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {job.modality.toUpperCase()} · created{" "}
                  {new Date(job.created_at).toLocaleString()}
                </p>
                <div className="mt-4">
                  <FilmViewer
                    caseRef={job.case_ref}
                    modality={job.modality}
                    findings={job.findings}
                    revealed={job.status !== "pending"}
                  />
                </div>
                {job.status === "pending" && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <EyeOff className="h-3.5 w-3.5" />
                    Model annotations hidden until your reading is recorded.
                  </p>
                )}
              </Card>

              <div className="space-y-4">
                {/* step 2 — the student's own read */}
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 font-display font-bold">
                    <UserRound className="h-4 w-4 text-primary" />
                    Your reading
                  </h3>
                  {job.student_finding ? (
                    <p className="mt-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                      {job.student_finding}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Write what you see, before the model runs. Once recorded it cannot be
                        edited — that is what makes the comparison honest.
                      </p>
                      <Textarea
                        className="mt-3"
                        rows={5}
                        value={reading}
                        onChange={(e) => setReading(e.target.value)}
                        placeholder="e.g. Opacity in the right lower zone, no effusion, heart size normal…"
                      />
                      <Button
                        className="mt-3 w-full"
                        onClick={saveReading}
                        disabled={busy || !reading.trim()}
                      >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                        Lock in my reading
                      </Button>
                    </>
                  )}
                </Card>

                {/* step 3 — the model */}
                <Card className="p-5">
                  <h3 className="flex items-center gap-2 font-display font-bold">
                    <Scan className="h-4 w-4 text-accent" />
                    Model output
                  </h3>
                  {job.status === "pending" ? (
                    <>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Runs only after your reading is locked in.
                      </p>
                      <Button
                        className="mt-3 w-full"
                        variant="accent"
                        onClick={analyze}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                        Run analysis
                      </Button>
                    </>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="muted">
                          {job.model_name} {job.model_version}
                        </Badge>
                        <span>mean confidence {(job.mean_confidence * 100).toFixed(1)}%</span>
                      </div>

                      {job.uncertainty_flag && (
                        <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                          <p className="text-sm">
                            At least one finding sits below the confidence threshold.
                            {job.requires_review && " This case is flagged for human review."}
                          </p>
                        </div>
                      )}

                      <ul className="space-y-2">
                        {job.findings.map((f, i) => (
                          <li key={`${f.label}-${i}`} className="rounded-xl border border-border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{f.label}</span>
                              <span
                                className={`text-sm font-semibold ${
                                  f.confidence < 0.7 ? "text-warning" : "text-success"
                                }`}
                              >
                                {(f.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full rounded-full ${
                                  f.confidence < 0.7 ? "bg-warning" : "bg-success"
                                }`}
                                style={{ width: `${f.confidence * 100}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{f.description}</p>
                          </li>
                        ))}
                      </ul>

                      {job.known_limitations.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowLimitations((v) => !v)}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {showLimitations ? "Hide" : "Show"} known limitations of this model
                          </button>
                          {showLimitations && (
                            <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-muted-foreground">
                              {job.known_limitations.map((l) => (
                                <li key={l}>{l}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      <p className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                        {job.disclaimer}
                      </p>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            {/* step 4 — the human commits */}
            {job.status !== "pending" && (
              <Card className="p-5">
                <h3 className="font-display font-bold">Your decision</h3>
                {job.final_decision ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {job.agreed_with_ai ? (
                        <Badge variant="info">
                          <ThumbsUp className="h-3 w-3" />
                          Agreed with the model
                        </Badge>
                      ) : (
                        <Badge variant="accent">
                          <ThumbsDown className="h-3 w-3" />
                          Overrode the model
                        </Badge>
                      )}
                    </div>
                    <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
                      {job.final_decision}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded against your name in the audit trail.{" "}
                      <Link to="/governance" className="text-primary hover:underline">
                        Open Governance
                      </Link>{" "}
                      to see the row.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You are accountable for the call, not the model. Say what you would do and
                      whether the model changed your mind.
                    </p>
                    <Textarea
                      className="mt-3"
                      rows={3}
                      value={decision}
                      onChange={(e) => setDecision(e.target.value)}
                      placeholder="Your final interpretation and next step…"
                    />
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button onClick={() => decide(true)} disabled={busy || !decision.trim()}>
                        <ThumbsUp className="h-4 w-4" />
                        Commit — I agree with the model
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => decide(false)}
                        disabled={busy || !decision.trim()}
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Commit — I disagree
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
