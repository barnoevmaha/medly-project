import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Loader2, RotateCcw, XCircle, Scan,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type Quiz as QuizType, type QuizResult } from "@/lib/api";

/**
 * A knowledge check.
 *
 * Correct answers are never sent to the client before submission — the payload
 * from `GET /api/quizzes/{id}` contains choices only. Grading happens on the
 * server, and passing a certification quiz is what flips `user.certified`,
 * which is the gate on AI-assisted imaging.
 */
export default function Quiz() {
  const { quizId = "" } = useParams();
  const [quiz, setQuiz] = useState<QuizType | null>(null);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .quiz(Number(quizId))
      .then(setQuiz)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this quiz"))
      .finally(() => setLoading(false));
  }, [quizId]);

  const answered = Object.values(answers).filter((a) => a.length > 0).length;
  const total = quiz?.questions.length ?? 0;
  const progress = total ? Math.round((answered / total) * 100) : 0;

  const resultByQuestion = useMemo(() => {
    const map = new Map<number, QuizResult["results"][number]>();
    result?.results.forEach((r) => map.set(r.question_id, r));
    return map;
  }, [result]);

  function toggle(questionId: number, choiceId: number, multi: boolean) {
    if (result) return; // locked once graded
    setAnswers((prev) => {
      const current = prev[questionId] ?? [];
      if (!multi) return { ...prev, [questionId]: [choiceId] };
      return {
        ...prev,
        [questionId]: current.includes(choiceId)
          ? current.filter((id) => id !== choiceId)
          : [...current, choiceId],
      };
    });
  }

  async function submit() {
    if (!quiz) return;
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api.submitQuiz(quiz.id, answers));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  function retake() {
    setAnswers({});
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading exam…
      </div>
    );
  }

  if (!quiz) {
    return (
      <Card className="p-6">
        <h2 className="font-display font-bold">Could not load this exam</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link to="/learn">
          <Button className="mt-4" variant="outline">Back to AI Training</Button>
        </Link>
      </Card>
    );
  }

  return (
    <>
      <Link
        to="/learn"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        AI Training
      </Link>

      <PageHeader title={quiz.title} subtitle={quiz.description} />

      {/* ---------- score card ---------- */}
      {result && (
        <Card
          className={`mb-8 p-6 ${
            result.passed ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold ${
                  result.passed ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                }`}
              >
                {result.score}%
              </div>
              <div>
                <h2 className="font-display text-xl font-bold">
                  {result.passed ? "Passed" : "Not passed"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Pass mark {result.passing_score}% · competency band{" "}
                  <span className="font-medium text-foreground">{result.band}</span>
                </p>
                {result.points_awarded > 0 && (
                  <p className="mt-1 text-sm font-medium text-success">
                    +{result.points_awarded} points · {result.total_points.toLocaleString()} total
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={retake}>
                <RotateCcw className="h-4 w-4" />
                Retake
              </Button>
              <Link to="/imaging">
                <Button variant="outline">
                  <Scan className="h-4 w-4" />
                  Practise in the workbench
                </Button>
              </Link>
            </div>
          </div>

        </Card>
      )}

      {/* ---------- progress ---------- */}
      {!result && (
        <Card className="mb-6 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              {answered} of {total} answered
            </span>
            <span className="text-muted-foreground">Pass mark {quiz.passing_score}%</span>
          </div>
          <Progress className="mt-3" value={progress} />
        </Card>
      )}

      {/* ---------- questions ---------- */}
      <div className="space-y-4">
        {quiz.questions.map((question, index) => {
          const multi = question.kind === "multi";
          const chosen = answers[question.id] ?? [];
          const graded = resultByQuestion.get(question.id);

          return (
            <Card key={question.id} className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold">
                    {index + 1}
                  </span>
                  <h3 className="font-display font-bold leading-snug">{question.prompt}</h3>
                </div>
                {graded &&
                  (graded.correct ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                  ))}
              </div>

              {multi && !graded && (
                <p className="mt-2 pl-9 text-xs text-muted-foreground">
                  Select every correct option — partial answers score nothing.
                </p>
              )}

              <div className="mt-4 space-y-2 pl-9">
                {question.choices.map((choice) => {
                  const selected = chosen.includes(choice.id);
                  const isCorrect = graded?.correct_choice_ids.includes(choice.id);
                  const wronglyPicked = graded && selected && !isCorrect;

                  let tone = "border-border hover:bg-muted";
                  if (graded && isCorrect) tone = "border-success/40 bg-success/5";
                  else if (wronglyPicked) tone = "border-destructive/40 bg-destructive/5";
                  else if (selected) tone = "border-primary/50 bg-primary/5";

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={!!result}
                      onClick={() => toggle(question.id, choice.id, multi)}
                      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors disabled:cursor-default ${tone}`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border ${
                          multi ? "rounded" : "rounded-full"
                        } ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`}
                      >
                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                      </span>
                      <span>{choice.text}</span>
                    </button>
                  );
                })}
              </div>

              {graded && (
                <div className="mt-4 ml-9 rounded-xl border border-border bg-muted/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Why
                  </p>
                  <p className="mt-1 text-sm">{graded.explanation}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {error && !result && (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      )}

      {!result && (
        <div className="sticky bottom-4 mt-6">
          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              {answered === total
                ? "All questions answered."
                : `${total - answered} question${total - answered === 1 ? "" : "s"} left.`}
            </p>
            <Button onClick={submit} disabled={submitting || answered === 0}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit exam
            </Button>
          </Card>
        </div>
      )}
    </>
  );
}
