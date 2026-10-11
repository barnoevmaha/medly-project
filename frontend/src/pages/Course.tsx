import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Circle, Clock, Loader2, ShieldCheck, Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Markdown } from "@/components/ui/markdown";
import { PageHeader } from "@/components/layout/PageHeader";
import { api, type CourseDetail, type LessonDetail, type Quiz } from "@/lib/api";

/** Course detail: lesson list on the left, the open lesson on the right. */
export default function Course() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const detail = await api.course(slug);
    setCourse(detail);
    // Enrolment is idempotent server-side, so opening a course is enough to join it.
    if (!detail.enrolled) {
      await api.enroll(slug).catch(() => undefined);
    }
    setQuizzes(await api.quizzesForCourse(slug).catch(() => []));
    return detail;
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    setLesson(null);
    load()
      .then(async (detail) => {
        // Open where the student left off: first lesson not yet completed.
        const next = detail.lessons.find((l) => l.status !== "completed") ?? detail.lessons[0];
        if (next) setLesson(await api.lesson(next.id));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load this course"))
      .finally(() => setLoading(false));
  }, [load]);

  async function openLesson(id: number) {
    setBusy(true);
    try {
      setLesson(await api.lesson(id));
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    if (!lesson) return;
    setBusy(true);
    try {
      await api.completeLesson(lesson.id);
      const detail = await load();
      const ordered = detail.lessons;
      const index = ordered.findIndex((l) => l.id === lesson.id);
      const next = ordered[index + 1];
      setLesson(next ? await api.lesson(next.id) : { ...lesson, status: "completed" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading course…
      </div>
    );
  }

  if (error || !course) {
    return (
      <Card className="p-6">
        <h2 className="font-display font-bold">Could not load this course</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/learn")}>
          Back to AI Training
        </Button>
      </Card>
    );
  }

  const exam = quizzes[0];
  const allDone = course.progress_pct === 100;
  const position = lesson ? course.lessons.findIndex((item) => item.id === lesson.id) : -1;
  const previous = position > 0 ? course.lessons[position - 1] : null;
  const following = position >= 0 ? course.lessons[position + 1] : null;
  const completedCount = course.lessons.filter((item) => item.status === "completed").length;

  return (
    <>
      <Link
        to="/learn"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        AI Training
      </Link>

      <PageHeader
        title={course.title}
        subtitle={course.summary}
        action={
<Badge variant="muted">{course.level}</Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* --- lesson list --- */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">{course.progress_pct}% complete</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" />
                {course.duration_minutes} min
              </span>
            </div>
            <Progress className="mt-3" value={course.progress_pct} />

            <ul className="mt-5 space-y-1">
              {course.lessons.map((item) => {
                const active = lesson?.id === item.id;
                const done = item.status === "completed";
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => openLesson(item.id)}
                      className={`flex w-full items-start gap-3 rounded-xl p-3 text-left text-sm transition-colors ${
                        active ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                      }`}
                    >
                      {done ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span>
                        <span className={active ? "font-semibold" : ""}>{item.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.kind} · {item.duration_minutes} min
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {exam && (
            <Card
              className={`p-5 ${
                allDone ? "border-accent/30 bg-accent/5" : "border-border"
              }`}
            >
              <h3 className="flex items-center gap-2 font-display font-bold">
                <ShieldCheck className="h-4 w-4 text-accent" />
                {exam.title}
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{exam.description}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {exam.questions.length} questions · pass mark {exam.passing_score}%
              </p>
              <Link to={`/quiz/${exam.id}`}>
                <Button className="mt-4 w-full" variant={allDone ? "accent" : "outline"}>
                  <Play className="h-4 w-4" />
                  {allDone ? "Take the exam" : "Take it early"}
                </Button>
              </Link>
              {!allDone && (
                <p className="mt-2 text-xs text-muted-foreground">
                  You can sit it before finishing the lessons — the pass mark is the same.
                </p>
              )}
            </Card>
          )}
        </div>

        {/* --- lesson body --- */}
        <Card className="p-6 md:p-8">
          {lesson ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="muted">
                  <BookOpen className="h-3 w-3" />
                  Lesson {position + 1} of {course.lessons.length}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {lesson.duration_minutes} min read
                </span>
                {lesson.status === "completed" && (
                  <Badge variant="success">
                    <CheckCircle2 className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
              </div>

              <h2 className="mt-4 font-display text-2xl font-bold">{lesson.title}</h2>

              {lesson.key_point && (
                <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Key point
                  </p>
                  <p className="mt-1 text-sm text-foreground">{lesson.key_point}</p>
                </div>
              )}

              <div className="mt-6">
                <Markdown>{lesson.body_md}</Markdown>
              </div>

              <div className="mt-8 border-t border-border pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    disabled={!previous || busy}
                    onClick={() => previous && openLesson(previous.id)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="max-w-[12rem] truncate">
                      {previous ? previous.title : "Previous"}
                    </span>
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    {completedCount} of {course.lessons.length} complete
                  </span>

                  <Button
                    variant="outline"
                    disabled={!following || busy}
                    onClick={() => following && openLesson(following.id)}
                  >
                    <span className="max-w-[12rem] truncate">
                      {following ? following.title : "Next"}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={markComplete} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {lesson.status === "completed"
                      ? following
                        ? "Continue to next lesson"
                        : "Lesson complete"
                      : "Mark complete & continue"}
                  </Button>
                  {exam && (
                    <Link to={`/quiz/${exam.id}`}>
                      <Button variant="outline">
                        {allDone ? "Take the exam" : "Skip to the exam"}
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              This course has no lessons yet. Run <code className="rounded bg-muted px-1">python -m app.seed</code>{" "}
              in the backend folder.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
