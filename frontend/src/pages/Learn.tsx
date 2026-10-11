import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Clock, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/PageHeader";
import { IconTile } from "@/components/ui/icon";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { api, type CourseSummary } from "@/lib/api";

export default function Learn() {
  const { t } = useLanguage();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setCourses(await api.courses());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("learn.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const started = courses.filter((course) => course.progress_pct > 0);

  return (
    <>
      <PageHeader
        title={t("learn.title")}
        subtitle={t("learn.subtitle")}
        action={
          started.length > 0 && (
            <Link to={`/learn/${started[0].slug}`}>
              <Button>{t("learn.resume")}</Button>
            </Link>
          )
        }
      />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-8 w-8" />}
          title={t("learn.noCourses")}
          body={t("learn.noCoursesBody")}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courses.map((course) => {
            const done = course.progress_pct === 100;
            return (
              <Card key={course.id} className="flex flex-col p-5 card-hover">
                <div className="flex items-start justify-between gap-3">
                  <IconTile name={course.icon} />
                  <Badge variant="muted">{course.level}</Badge>
                </div>

                <h2 className="mt-4 font-display text-lg font-bold leading-snug">
                  {course.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{course.summary}</p>

                <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    {course.lesson_count} lessons
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    {course.duration_minutes} min
                  </span>
                </div>

                {course.progress_pct > 0 && (
                  <div className="mt-4">
                    <Progress value={course.progress_pct} />
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {done && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                      )}
                      {course.progress_pct}% complete
                    </div>
                  </div>
                )}

                <Link to={`/learn/${course.slug}`} className="mt-5">
                  <Button className="w-full" variant={done ? "outline" : "default"}>
                    {done
                      ? t("learn.review")
                      : course.progress_pct > 0
                        ? t("common.continue")
                        : t("learn.start")}
                    <span className="sr-only"> — {course.title}</span>
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
