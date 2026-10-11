import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, ImagePlus, Loader2,
  ShieldCheck, ShieldQuestion, Upload,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilmViewer } from "@/components/imaging/FilmViewer";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { api, type CaseDetail } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  pending: "Not yet redacted",
  auto_redacted: "Automatic pass complete — awaiting human verification",
  verified: "Verified by a teacher",
};

/**
 * A single case reference.
 *
 * A student only ever receives images the API has already filtered to
 * `verified`; the anonymisation panel below is shown so the provenance of that
 * decision is visible rather than implied.
 */
export default function CaseReference() {
  const { id = "" } = useParams();
  const toast = useToast();

  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [canAuthor, setCanAuthor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [imageForm, setImageForm] = useState({ caption: "", view: "PA" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseDetail, permissions] = await Promise.all([
        api.caseDetail(Number(id)),
        api.casebookPermissions().catch(() => ({ can_author: false, role: "student" as const, reason: "" })),
      ]);
      setDetail(caseDetail);
      setCanAuthor(permissions.can_author);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this case");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function attachImage(event: React.FormEvent) {
    event.preventDefault();
    if (!detail) return;
    setBusy(true);
    try {
      await api.addCaseImage(detail.id, {
        caption: imageForm.caption || "Untitled view",
        view: imageForm.view || "PA",
        // Stands in for the DICOM header that would arrive with a real scan.
        metadata: {
          PatientName: "Doe^Jane",
          PatientID: "MRN-99120",
          PatientBirthDate: "19580214",
          PatientAge: "068Y",
          PatientSex: "F",
          InstitutionName: "St Elsewhere General",
          Modality: detail.modality === "ct" ? "CT" : "CR",
          BodyPartExamined: detail.body_region.toUpperCase(),
          StudyDate: "20260210",
        },
        overlay_text: "Doe, Jane  MRN 99120  14/02/2026",
      });
      toast("Image attached and redaction pass run — verify it before publishing");
      setImageForm({ caption: "", view: "PA" });
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not attach that image", "error");
    } finally {
      setBusy(false);
    }
  }

  async function verify(imageId: number) {
    setBusy(true);
    try {
      await api.verifyCaseImage(imageId);
      toast("Anonymisation verified and recorded against your name");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not verify that image", "error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    if (!detail) return;
    setBusy(true);
    try {
      const updated = detail.published
        ? await api.unpublishCase(detail.id)
        : await api.publishCase(detail.id);
      setDetail(updated);
      toast(updated.published ? "Case published to students" : "Case withdrawn from students");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not change publication", "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Opening case…" />;
  if (error || !detail) {
    return <ErrorState title="Could not open this case" message={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <>
      <Link
        to="/imaging/cases"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Case references
      </Link>

      <Card className="mb-6 p-6 shadow-medium">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted">{detail.case_ref}</Badge>
              <Badge variant="info">{detail.modality.toUpperCase()}</Badge>
              <Badge variant="muted">{detail.difficulty}</Badge>
              {detail.published ? (
                <Badge variant="success">
                  <ShieldCheck className="h-3 w-3" />
                  Published
                </Badge>
              ) : (
                <Badge variant="warning">
                  <EyeOff className="h-3 w-3" />
                  Draft
                </Badge>
              )}
            </div>
            <h1 className="mt-3 font-display text-2xl font-bold md:text-3xl">{detail.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.body_region} · {detail.patient_age_band || "age band withheld"}
              {detail.patient_sex ? `, ${detail.patient_sex}` : ""} · authored by{" "}
              {detail.author_name}
            </p>
          </div>
          {canAuthor && (
            <Button variant={detail.published ? "outline" : "default"} onClick={() => void togglePublish()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {detail.published ? "Withdraw" : "Publish to students"}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="font-display text-lg font-bold">Clinical context</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {detail.clinical_context || "No context recorded."}
            </p>
          </Card>

          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">
              Images ({detail.images.length})
            </h2>
            {detail.images.length === 0 && (
              <Card className="p-8 text-center">
                <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {canAuthor
                    ? "No images attached yet. Attach one below — the redaction pass runs automatically, then you verify it."
                    : "No verified images are available for this case yet."}
                </p>
              </Card>
            )}
            {detail.images.map((image) => (
              <Card key={image.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display font-bold">{image.caption}</h3>
                    <p className="text-sm text-muted-foreground">View: {image.view}</p>
                  </div>
                  {image.anonymization_status === "verified" ? (
                    <Badge variant="success">
                      <ShieldCheck className="h-3 w-3" />
                      Anonymisation verified
                    </Badge>
                  ) : (
                    <Badge variant="warning">
                      <ShieldQuestion className="h-3 w-3" />
                      Awaiting verification
                    </Badge>
                  )}
                </div>

                <div className="mt-4">
                  <FilmViewer
                    caseRef={image.render_seed || detail.case_ref}
                    modality={detail.modality}
                    findings={[]}
                    revealed={false}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Anonymisation record
                  </p>
                  <p className="mt-1.5 text-sm">{STATUS_LABEL[image.anonymization_status]}</p>
                  {image.redacted_fields.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {image.redacted_fields.map((field) => (
                        <li key={field}>
                          <Badge variant="muted">removed: {field}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                  {image.verified_by_name && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Verified by {image.verified_by_name}
                      {image.verified_at
                        ? ` on ${new Date(image.verified_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  )}
                  {image.review_notes && (
                    <p className="mt-2 text-xs text-muted-foreground">{image.review_notes}</p>
                  )}
                  {canAuthor && image.anonymization_status !== "verified" && (
                    <Button
                      className="mt-3"
                      size="sm"
                      onClick={() => void verify(image.id)}
                      disabled={busy}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      I have checked this image — verify
                    </Button>
                  )}
                </div>
              </Card>
            ))}

            {canAuthor && (
              <Card className="p-5">
                <h3 className="flex items-center gap-2 font-display font-bold">
                  <Upload className="h-4 w-4 text-primary" />
                  Attach an image
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  In production this is where the hospital scan arrives. The automatic pass strips
                  the identifying header fields and masks identifier-shaped overlay text, then
                  stops — a human has to confirm it before any student can load the image.
                </p>
                <form onSubmit={attachImage} className="mt-4 flex flex-wrap gap-3">
                  <Input
                    className="min-w-[200px] flex-1"
                    value={imageForm.caption}
                    onChange={(event) => setImageForm({ ...imageForm, caption: event.target.value })}
                    placeholder="Caption, e.g. PA chest radiograph on admission"
                    aria-label="Caption"
                  />
                  <Input
                    className="w-28"
                    value={imageForm.view}
                    onChange={(event) => setImageForm({ ...imageForm, view: event.target.value })}
                    placeholder="View"
                    aria-label="View"
                  />
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Attach & redact
                  </Button>
                </form>
              </Card>
            )}
          </div>

          <Card className="p-6">
            <h2 className="font-display text-lg font-bold">Teaching points</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {detail.teaching_points || "No teaching points recorded."}
            </p>

            <div className="mt-6 border-t border-border pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-display font-bold">Findings</h3>
                <Button size="sm" variant="outline" onClick={() => setReveal((value) => !value)}>
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {reveal ? "Hide findings" : "Reveal findings"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Commit to your own read before revealing this.
              </p>
              {reveal && (
                <p className="mt-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
                  {detail.findings_summary || "No findings summary recorded."}
                </p>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="border-primary/20 bg-primary/5 p-5">
            <h3 className="flex items-center gap-2 font-display font-bold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              How this image reached you
            </h3>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. A teacher created the case reference.</li>
              <li>2. The scan was attached to it.</li>
              <li>3. Identifying header fields and overlay text were redacted automatically.</li>
              <li>4. A named teacher verified the redaction by eye.</li>
              <li>5. Only then was the case published.</li>
            </ol>
            <p className="mt-3 text-xs text-muted-foreground">
              Students are never served an image at any earlier stage — the filter is in the API.
            </p>
          </Card>

          <Card className="border-warning/30 bg-warning/5 p-5">
            <h3 className="flex items-center gap-2 font-display font-bold">
              <AlertTriangle className="h-4 w-4 text-warning" />
              What automation cannot settle
            </h3>
            <ul className="mt-3 ml-4 list-disc space-y-1.5 text-xs text-muted-foreground">
              {detail.residual_risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              A redaction tool that reports nothing looks the same whether the image was clean or
              it was pointed at the wrong layer. That is why the human step is not optional.
            </p>
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-bold">Practise this case</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Take the reference into the workbench and work it with the four-step safety flow.
            </p>
            <Link to="/imaging">
              <Button className="mt-3 w-full" variant="outline">
                Open the workbench
              </Button>
            </Link>
          </Card>
        </aside>
      </div>
    </>
  );
}
