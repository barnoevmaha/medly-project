import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen, EyeOff, Loader2, Lock, Plus, Scan, ShieldCheck, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/layout/PageHeader";
import { ImagingTabs } from "@/components/imaging/ImagingTabs";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { api, type CasebookPermissions, type CaseSummary, type Modality } from "@/lib/api";

const EMPTY = {
  case_ref: "",
  title: "",
  modality: "xray" as Modality,
  body_region: "Chest",
  patient_age_band: "",
  patient_sex: "",
  clinical_context: "",
  teaching_points: "",
  findings_summary: "",
  difficulty: "medium",
};

/**
 * Case references.
 *
 * Students see published cases. Teachers additionally see their drafts and the
 * authoring form — and the API refuses the POST for anyone else, so hiding the
 * form is presentation, not the control.
 */
export default function Casebook() {
  const navigate = useNavigate();
  const toast = useToast();

  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [permissions, setPermissions] = useState<CasebookPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, perms] = await Promise.all([api.cases(), api.casebookPermissions()]);
      setCases(list);
      setPermissions(perms);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load case references");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api.createCaseReference(form);
      toast("Case reference created — add an image next");
      setForm(EMPTY);
      setComposing(false);
      navigate(`/imaging/cases/${created.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create that case", "error");
    } finally {
      setCreating(false);
    }
  }

  const canAuthor = permissions?.can_author ?? false;

  return (
    <>
      <PageHeader
        title="Case references"
        subtitle="Teaching cases authored by faculty, with every image anonymised and verified"
        action={
          canAuthor && (
            <Button onClick={() => setComposing((value) => !value)}>
              {composing ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {composing ? "Cancel" : "New case reference"}
            </Button>
          )
        }
      />

      <ImagingTabs />

      {!canAuthor && (
        <Card className="mb-6 border-primary/20 bg-primary/5 p-5">
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="font-display font-bold">Cases are authored by teachers</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                You can open any published case and work through it. Creating and managing case
                references is restricted to faculty, and the restriction is enforced by the API.
              </p>
            </div>
          </div>
        </Card>
      )}

      {composing && canAuthor && (
        <Card className="mb-6 p-6 animate-fade-up">
          <h3 className="font-display text-lg font-bold">New case reference</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Record the teaching context first. Images are attached on the next screen, where the
            redaction pass runs and you sign it off.
          </p>
          <form onSubmit={create} className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input
              value={form.case_ref}
              onChange={(event) => setForm({ ...form, case_ref: event.target.value })}
              placeholder="Case reference, e.g. CXR-2099"
              required
              aria-label="Case reference"
            />
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Case title"
              required
              aria-label="Case title"
            />
            <div className="flex gap-2">
              {(["xray", "ct"] as Modality[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm({ ...form, modality: value })}
                  className={`flex-1 rounded-xl border p-2 text-sm font-medium transition-colors ${
                    form.modality === value
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {value === "xray" ? "X-ray" : "CT"}
                </button>
              ))}
            </div>
            <Input
              value={form.body_region}
              onChange={(event) => setForm({ ...form, body_region: event.target.value })}
              placeholder="Body region"
              aria-label="Body region"
            />
            <Input
              value={form.patient_age_band}
              onChange={(event) => setForm({ ...form, patient_age_band: event.target.value })}
              placeholder="Age band, e.g. 60-69 (never a date of birth)"
              aria-label="Age band"
            />
            <Input
              value={form.patient_sex}
              onChange={(event) => setForm({ ...form, patient_sex: event.target.value })}
              placeholder="Sex, e.g. F"
              aria-label="Sex"
            />
            <Textarea
              className="sm:col-span-2"
              rows={3}
              value={form.clinical_context}
              onChange={(event) => setForm({ ...form, clinical_context: event.target.value })}
              placeholder="Clinical context the student sees before reading the image"
              aria-label="Clinical context"
            />
            <Textarea
              className="sm:col-span-2"
              rows={3}
              value={form.teaching_points}
              onChange={(event) => setForm({ ...form, teaching_points: event.target.value })}
              placeholder="Teaching points"
              aria-label="Teaching points"
            />
            <Textarea
              className="sm:col-span-2"
              rows={2}
              value={form.findings_summary}
              onChange={(event) => setForm({ ...form, findings_summary: event.target.value })}
              placeholder="Findings summary"
              aria-label="Findings summary"
            />
            <div className="sm:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create case reference
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Use anonymised or synthetic imaging only. Never enter a patient name, date of
                birth or record number in any field on this form.
              </p>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<Scan className="h-8 w-8" />}
          title="No case references yet"
          body={
            canAuthor
              ? "Create the first one — record the clinical context, attach an image, verify the redaction, then publish."
              : "Your faculty has not published any teaching cases yet."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cases.map((item) => (
            <Link key={item.id} to={`/imaging/cases/${item.id}`}>
              <Card className="flex h-full flex-col p-5 card-hover animate-fade-in">
                <div className="flex items-start justify-between gap-3">
                  <Badge variant="muted">{item.case_ref}</Badge>
                  <div className="flex items-center gap-2">
                    <Badge variant="info">{item.modality.toUpperCase()}</Badge>
                    {item.published ? (
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
                </div>

                <h3 className="mt-4 font-display text-lg font-bold leading-snug">{item.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {item.clinical_context}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.body_region}</span>
                  <span>·</span>
                  <span>
                    {item.patient_age_band || "age band withheld"}
                    {item.patient_sex ? `, ${item.patient_sex}` : ""}
                  </span>
                  <span>·</span>
                  <span>{item.image_count} image{item.image_count === 1 ? "" : "s"}</span>
                </div>

                <div className="mt-auto flex items-center justify-between pt-5 text-xs text-muted-foreground">
                  <span>By {item.author_name}</span>
                  {item.pending_verification > 0 && canAuthor && (
                    <span className="flex items-center gap-1 text-warning">
                      <Lock className="h-3.5 w-3.5" />
                      {item.pending_verification} awaiting verification
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
