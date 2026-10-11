import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Award, CheckCircle2, ChevronRight, Clock, Flame, Medal, PencilLine, Sprout, Target,
  Trophy, Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCentered } from "@/components/ui/stat-tile";
import { Avatar } from "@/components/ui/avatar";
import { Cover } from "@/components/ui/cover";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useLanguage } from "@/lib/i18n";
import {
  api,
  type ChallengeSummary,
  type LeaderboardRow,
  type Profile,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/* Difficulty reads as a colour before it reads as a word. */
const DIFFICULTY = {
  easy: { color: "#16A34A", icon: Sprout },
  medium: { color: "#EA580C", icon: PencilLine },
  hard: { color: "#DC2626", icon: Flame },
} as const;
const medalColor = ["text-warning", "text-muted-foreground", "text-accent"];

export default function Challenges() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useLanguage();

  function endsIn(iso: string | null): string {
    if (!iso) return t("challenges.noDeadline");
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return t("challenges.closed");
    const hours = Math.floor(ms / 3_600_000);
    if (hours < 24) return t("challenges.hoursLeft", { n: hours });
    return t("challenges.daysHoursLeft", { d: Math.floor(hours / 24), h: hours % 24 });
  }

  const DIFFICULTY_LABEL: Record<string, string> = {
    easy: t("challenges.difficultyEasy"),
    medium: t("challenges.difficultyMedium"),
    hard: t("challenges.difficultyHard"),
  };

  const [challenges, setChallenges] = useState<ChallengeSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [list, me, rows] = await Promise.all([
        api.challenges(),
        api.profile(),
        api.leaderboard(5),
      ]);
      setChallenges(list);
      setProfile(me);
      setBoard(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("challenges.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [lang]);

  async function open(challenge: ChallengeSummary) {
    setBusy(challenge.slug);
    try {
      // Joining is recorded server-side, then the challenge actually opens —
      // the button is not a toggle.
      if (!challenge.joined) await api.joinChallenge(challenge.slug);
      navigate(`/challenges/${challenge.slug}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("challenges.openError"), "error");
    } finally {
      setBusy(null);
    }
  }

  /* One colour each, so the row reads as three different measures rather than
     three copies of the same card. */
  const stats = [
    {
      icon: Flame,
      color: "#EF6B57",
      value: profile ? profile.points.toLocaleString() : "\u2014",
      label: t("challenges.totalPoints"),
    },
    {
      icon: Target,
      color: "#0F9B96",
      value: profile ? `#${profile.rank}` : "\u2014",
      label: t("challenges.ofStudents", { n: profile?.total_users ?? 0 }),
    },
    {
      icon: Award,
      color: "#E8A33C",
      value: profile ? String(profile.challenges_completed) : "\u2014",
      label: t("challenges.started"),
    },
  ];

  return (
    <>
      <PageHeader title={t("challenges.title")} subtitle={t("challenges.subtitle")} />

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {stats.map((stat) => (
          <StatCentered
            key={stat.label}
            icon={stat.icon}
            color={stat.color}
            value={stat.value}
            label={stat.label}
          />
        ))}
      </div>

      <h2 className="mb-4 font-display text-2xl font-bold">{t("challenges.active")}</h2>

      {loading ? (
        <div className="mb-12 grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : challenges.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title={t("challenges.noneRunning")}
          body={t("challenges.checkBack")}
        />
      ) : (
        <div className="mb-12 grid gap-4 sm:grid-cols-2">
          {challenges.map((challenge) => {
            const progress = challenge.question_count
              ? (challenge.answered_count / challenge.question_count) * 100
              : 0;
            const difficulty =
              DIFFICULTY[challenge.difficulty as keyof typeof DIFFICULTY] ?? DIFFICULTY.medium;
            return (
              <Card
                key={challenge.id}
                className="flex flex-col overflow-hidden p-0 card-hover animate-fade-in"
              >
                {/* Cover, with the two badges floating over it. */}
                <div className="relative">
                  <Link
                    to={`/challenges/${challenge.slug}`}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="block"
                  >
                    <Cover
                      src={challenge.cover}
                      width={360}
                      height={160}
                      fit="crop"
                      className="border-b border-border"
                    />
                  </Link>
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-slate-800 shadow-soft backdrop-blur">
                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                    {challenge.points} {t("dashboard.pts")}
                  </span>
                  <span
                    className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold capitalize text-white shadow-soft"
                    style={{ backgroundColor: difficulty.color }}
                  >
                    <difficulty.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {DIFFICULTY_LABEL[challenge.difficulty] ?? challenge.difficulty}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-display text-lg font-bold leading-snug">
                    {challenge.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {challenge.description}
                  </p>

                  <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      {challenge.participants.toLocaleString()} {t("challenges.joined")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                      {endsIn(challenge.ends_at)}
                    </span>
                  </div>

                  {challenge.joined && (
                    <div className="mt-3">
                      <Progress value={progress} />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {t("challenges.answeredSummary", {
                          answered: challenge.answered_count,
                          total: challenge.question_count,
                          pts: challenge.earned_points,
                        })}
                      </p>
                    </div>
                  )}

                  {/* mt-auto alone pins the button to the card floor, which on a
                      short card leaves it touching the participants row. The
                      wrapper keeps that alignment and guarantees a gap. */}
                  <div className="mt-auto pt-5">
                  <Button
                    variant="outline"
                    className="w-full border-primary text-primary hover:bg-primary/5"
                    disabled={busy === challenge.slug}
                    onClick={() => void open(challenge)}
                  >
                    {challenge.completed ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        {t("challenges.reviewAnswers")}
                      </>
                    ) : (
                      <>
                        {challenge.joined ? t("challenges.continue") : t("challenges.join")}
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </>
                    )}
                  </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold">{t("challenges.topLeaderboard")}</h2>
        <Link to="/leaderboard">
          <Button variant="link" size="sm">
            {t("challenges.fullRanking")}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
      </div>
      <Card className="divide-y divide-border p-0">
        {board.map((row) => (
          <div
            key={row.user_id}
            className={cn("flex items-center gap-4 px-5 py-4", row.you && "bg-primary/5")}
          >
            <div className="w-8 shrink-0 text-center">
              {row.rank <= 3 ? (
                <Medal className={cn("mx-auto h-6 w-6", medalColor[row.rank - 1])} />
              ) : (
                <span className="font-display font-bold text-muted-foreground">#{row.rank}</span>
              )}
            </div>
            <Avatar src={row.avatar_url || undefined} name={row.name} className="h-10 w-10 shrink-0 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold">{row.name}</span>
                {row.you && <Badge>{t("common.you")}</Badge>}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {row.institution || "Medly"}
              </div>
            </div>
            <div className="shrink-0 font-display font-bold text-primary">
              {row.points.toLocaleString()}
            </div>
          </div>
        ))}
        {board.length === 0 && !loading && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {t("challenges.noScores")}
          </p>
        )}
      </Card>
    </>
  );
}
