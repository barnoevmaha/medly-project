import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Loader2, Sparkles, Trophy, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { Icon } from "@/components/ui/icon";
import { FilmViewer } from "@/components/imaging/FilmViewer";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";
import { useProvideAiContext } from "@/lib/ai-context";
import { api, type AnswerResult, type ChallengeDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The challenge itself.
 *
 * Points are awarded by the server on the first correct answer to each
 * question and never again, so reopening a finished challenge shows the
 * previous result rather than paying out twice.
 */
export default function ChallengeRun() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useSession();
  const { t, lang } = useLanguage();

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Joining here as well means a direct link to this URL works — the
      // participant row exists either way.
      const detail = await api.joinChallenge(slug);
      setChallenge(detail);
      const firstUnanswered = detail.questions.findIndex((question) => !question.answered);
      setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
      setFinished(firstUnanswered === -1 && detail.questions.length > 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("challenges.openError"));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load, lang]);

  const question = challenge?.questions[index];

  /* Medly AI sees the question on screen and how it went, so "explain that"
     means this question. The challenge title and description come from the
     server's own rows; only the transient bit travels from here, and the
     answer is only named once the student has actually answered — the
     assistant is not a way to skip the question. */
  useProvideAiContext(
    challenge && question
      ? {
          kind: "challenge",
          key: challenge.slug,
          label: challenge.title,
          note: [
            `Question ${index + 1} of ${challenge.questions.length}: ${question.prompt}`,
            `Options: ${question.choices.map((c) => c.text).join(" | ")}`,
            question.answered
              ? `The student answered ${
                  question.correct ? "correctly" : "incorrectly"
                }. They chose: ${
                  question.choices.find((c) => c.id === question.chosen_choice_id)?.text ?? "—"
                }. The correct answer is: ${
                  question.choices.find((c) => c.id === question.correct_choice_id)?.text ?? "—"
                }.`
              : "The student has not answered yet — do not give the answer away.",
          ].join("\n"),
        }
      : null
  );

  // Deliberately keyed on the question, not on `challenge` — submitting an
  // answer replaces the challenge object, and depending on it here would
  // immediately overwrite the fresh result (points and all) with a replay.
  useEffect(() => {
    const current = challenge?.questions[index];
    if (!current) return;
    setSelected(current.chosen_choice_id);
    setResult(
      current.answered
        ? {
            question_id: current.id,
            correct: Boolean(current.correct),
            correct_choice_id: current.correct_choice_id ?? 0,
            explanation: current.explanation ?? "",
            points_awarded: 0,
            already_answered: true,
            earned_points: challenge?.earned_points ?? 0,
            answered_count: challenge?.answered_count ?? 0,
            question_count: challenge?.question_count ?? 0,
            completed: Boolean(challenge?.completed),
            total_points: 0,
            rank: 0,
            new_badges: [],
          }
        : null
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, challenge?.slug]);

  async function submit() {
    if (!challenge || !question || selected === null) return;
    setBusy(true);
    try {
      const outcome = await api.answerChallenge(challenge.slug, question.id, selected);
      setResult(outcome);
      setChallenge({
        ...challenge,
        answered_count: outcome.answered_count,
        earned_points: outcome.earned_points,
        completed: outcome.completed,
        questions: challenge.questions.map((item) =>
          item.id === question.id
            ? {
                ...item,
                answered: true,
                correct: outcome.correct,
                chosen_choice_id: selected,
                correct_choice_id: outcome.correct_choice_id,
                explanation: outcome.explanation,
              }
            : item
        ),
      });
      if (outcome.points_awarded > 0) {
        toast(t("run.correctPoints", { n: outcome.points_awarded }));
      } else if (outcome.already_answered) {
        toast(t("run.alreadyAnsweredToast"), "info");
      }
      outcome.new_badges.forEach((badge) => toast(t("run.badgeUnlocked", { badge }), "success"));
      await refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("run.submitError"), "error");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (!challenge) return;
    if (index + 1 < challenge.questions.length) {
      setIndex(index + 1);
      setResult(null);
      setSelected(null);
    } else {
      setFinished(true);
    }
  }

  if (loading) return <LoadingState label={t("run.opening")} />;

  if (error || !challenge) {
    return (
      <ErrorState
        title={t("challenges.openError")}
        message={error ?? undefined}
        onRetry={() => void load()}
      />
    );
  }

  const answered = challenge.questions.filter((item) => item.answered).length;
  const correct = challenge.questions.filter((item) => item.correct).length;
  const progress = challenge.question_count
    ? (answered / challenge.question_count) * 100
    : 0;

  if (finished) {
    return (
      <div className="mx-auto max-w-2xl">
        <Link
          to="/challenges"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("nav.challenges")}
        </Link>

        <Card className="p-8 text-center shadow-medium">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon name={challenge.icon} className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">{challenge.title}</h1>
          <Badge className="mt-3" variant="success">
            <Trophy className="h-3 w-3" />
            {t("run.complete")}
          </Badge>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <div>
              <div className="font-display text-3xl font-bold text-primary">
                {correct}/{challenge.question_count}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{t("run.correctLabel")}</div>
            </div>
            <div>
              <div className="font-display text-3xl font-bold text-success">
                {challenge.earned_points}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{t("run.pointsEarned")}</div>
            </div>
            <div>
              <div className="font-display text-3xl font-bold text-accent">
                {Math.round((correct / Math.max(1, challenge.question_count)) * 100)}%
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{t("run.accuracy")}</div>
            </div>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">{t("run.reviewHint")}</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                setFinished(false);
                setIndex(0);
              }}
            >
              {t("challenges.reviewAnswers")}
            </Button>
            <Link to="/leaderboard">
              <Button variant="outline">{t("run.seeLeaderboard")}</Button>
            </Link>
            <Button variant="ghost" onClick={() => navigate("/challenges")}>
              {t("run.moreChallenges")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/challenges"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("nav.challenges")}
      </Link>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold">
              <Icon name={challenge.icon} className="h-6 w-6 text-primary" />
              {challenge.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{challenge.description}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("run.topicLabel", { topic: challenge.topic })}
            </p>
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-bold text-success">
              {challenge.earned_points}
            </div>
            <div className="text-xs text-muted-foreground">{t("run.pointsEarned")}</div>
          </div>
        </div>

        <div className="mt-5">
          <Progress value={progress} />
          <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>{t("run.questionProgress", { n: index + 1, total: challenge.question_count })}</span>
            <span>{t("run.answeredCount", { n: answered })}</span>
          </div>
        </div>
      </Card>

      {question && (
        <Card className="p-6 md:p-8">
          <div className="flex items-center gap-2">
            <Badge variant="muted">{t("run.questionBadge", { n: index + 1 })}</Badge>
            <Badge variant="solid">
              {question.points} {t("dashboard.pts")}
            </Badge>
          </div>

          <h2 className="mt-4 font-display text-xl font-bold leading-snug">{question.prompt}</h2>

          {question.image_seed && (
            <figure className="mt-5">
              <div className="mx-auto max-w-sm">
                <FilmViewer
                  caseRef={question.image_seed}
                  modality={question.image_modality === "ct" ? "ct" : "xray"}
                  findings={[]}
                  revealed={false}
                />
              </div>
              <figcaption className="mt-2 text-xs text-muted-foreground">
                {question.image_alt}
              </figcaption>
            </figure>
          )}

          <div className="mt-6 space-y-3">
            {question.choices.map((choice) => {
              const isChosen = selected === choice.id;
              const isCorrect = result && result.correct_choice_id === choice.id;
              const isWrongPick = result && isChosen && !result.correct;
              return (
                <button
                  key={choice.id}
                  disabled={Boolean(result) || busy}
                  onClick={() => setSelected(choice.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-4 text-left text-sm transition-all",
                    !result && isChosen && "border-primary bg-primary/5 ring-2 ring-primary/30",
                    !result && !isChosen && "border-border hover:bg-muted",
                    isCorrect && "border-success/50 bg-success/10",
                    isWrongPick && "border-destructive/50 bg-destructive/10",
                    result && !isCorrect && !isWrongPick && "border-border opacity-60"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      isChosen ? "border-primary text-primary" : "border-muted-foreground/40"
                    )}
                  >
                    {isCorrect ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : isWrongPick ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : null}
                  </span>
                  <span className="flex-1">{choice.text}</span>
                </button>
              );
            })}
          </div>

          {result && (
            <div
              className={cn(
                "mt-6 rounded-xl border p-4",
                result.correct
                  ? "border-success/40 bg-success/5"
                  : "border-warning/40 bg-warning/5"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {result.correct ? (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("run.correctLabel")}
                  </Badge>
                ) : (
                  <Badge variant="warning">
                    <XCircle className="h-3 w-3" />
                    {t("run.notQuite")}
                  </Badge>
                )}
                {result.points_awarded > 0 && (
                  <Badge variant="solid">
                    <Sparkles className="h-3 w-3" />
                    {t("run.pointsAwarded", { n: result.points_awarded })}
                  </Badge>
                )}
                {result.already_answered && (
                  <span className="text-xs text-muted-foreground">
                    {t("run.alreadyAnsweredInline")}
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm">{result.explanation}</p>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
            <Button
              variant="ghost"
              disabled={index === 0}
              onClick={() => {
                setIndex(Math.max(0, index - 1));
                setResult(null);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("common.previous")}
            </Button>

            {result ? (
              <Button onClick={next}>
                {index + 1 < challenge.questions.length ? t("run.nextQuestion") : t("run.finish")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => void submit()} disabled={selected === null || busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("run.submitAnswer")}
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
