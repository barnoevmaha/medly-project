import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Loader2, Play, RotateCcw, Stethoscope } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { PatientFigure } from "@/components/virtual-patient/PatientFigure";
import { expressionFor } from "@/components/virtual-patient/PatientAvatar";
import { useToast } from "@/components/ui/toast";
import { useLanguage } from "@/lib/i18n";
import { api, type VpCase } from "@/lib/api";

/** Difficulty reads as a colour before it reads as a word — as on Challenges. */
const DIFFICULTY: Record<string, { badge: string; key: string }> = {
  easy: { badge: "success", key: "difficultyEasy" },
  medium: { badge: "warning", key: "difficultyMedium" },
  hard: { badge: "accent", key: "difficultyHard" },
};

export default function VirtualPatient() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useLanguage();
  const [starting, setStarting] = useState<string | null>(null);
  const [cases, setCases] = useState<VpCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCases(await api.vpCases());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("virtualPatient.couldNotLoadCases"));
    } finally {
      setLoading(false);
    }
  }, []);

  // `lang` is a dependency because case text is translated server-side and
  // sent per the X-Medly-Lang header: switching language has to refetch, or
  // the cards stay in the language they were first loaded in. Every other
  // content page in the app already does this; Virtual Patient did not.
  useEffect(() => {
    void load();
  }, [load, lang]);

  /* The server opens the run and hands back its id; the URL then names that
     run, so a refresh resumes it. An unfinished run is resumed rather than
     duplicated — that rule lives in the engine, not here. */
  async function open(slug: string) {
    if (starting) return;
    setStarting(slug);
    try {
      const session = await api.vpStart(slug);
      navigate(`/virtual-patient/session/${session.session_id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("virtualPatient.couldNotStart"), "error");
      setStarting(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("virtualPatient.title")}
        subtitle={t("virtualPatient.subtitle")}
      />

      <Card className="mb-6 border-primary/25 bg-primary/5 p-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("virtualPatient.safetyNote")}</span>
        </p>
      </Card>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<Stethoscope className="h-8 w-8" />}
          title={t("virtualPatient.noCases")}
          body={t("virtualPatient.noCasesBody")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {cases.map((item) => {
            const difficulty = DIFFICULTY[item.difficulty] ?? DIFFICULTY.medium;
            const inProgress = item.active_session_id !== null;
            return (
              <Card
                key={item.slug}
                className="flex flex-col overflow-hidden p-0 card-hover animate-fade-in"
              >
                <div className="flex items-start gap-4 border-b border-border bg-muted/30 p-5">
                  <PatientFigure
                    cover={item.cover}
                    // The card shows the patient as this student left them: mid-run
                    // it is the live condition, a finished case reads as recovered,
                    // and an untouched case is simply settled.
                    expression={
                      item.active_patient_state
                        ? expressionFor(item.active_patient_state)
                        : item.completed
                          ? "recovered"
                          : "stable"
                    }
                    age={item.patient_age}
                    sex={item.patient_sex}
                    name={item.patient_name}
                    size={92}
                    className="-my-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={difficulty.badge as never}>
                        {t(`virtualPatient.${difficulty.key}`)}
                      </Badge>
                      <Badge variant="muted">{item.specialty}</Badge>
                      {item.completed && <Badge variant="success">Completed</Badge>}
                    </div>
                    <h3 className="mt-2 font-display text-lg font-bold leading-snug">
                      {item.title}
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.patient_name}, {item.patient_age} · {item.presenting_complaint}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <p className="line-clamp-3 text-sm text-muted-foreground">{item.summary}</p>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {t("virtualPatient.estimatedMinutes", { n: item.estimated_minutes })}
                    </span>
                    <span>{t("virtualPatient.stageCount", { n: item.stage_count })}</span>
                    <span>{t("virtualPatient.pointsAvailable", { n: item.max_score })}</span>
                  </div>

                  {inProgress && (
                    <p className="mt-3 text-xs font-medium text-primary">
                      {t("virtualPatient.caseInProgress")}
                    </p>
                  )}

                  <div className="mt-auto pt-5">
                    <Button
                      className="w-full"
                      variant={inProgress ? "outline" : "default"}
                      disabled={starting !== null}
                      onClick={() => void open(item.slug)}
                    >
                      {starting === item.slug ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : inProgress ? (
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Play className="h-4 w-4" aria-hidden="true" />
                      )}
                      {inProgress
                        ? t("virtualPatient.resumeCase")
                        : item.completed
                          ? t("virtualPatient.playAgain")
                          : t("virtualPatient.startCase")}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
