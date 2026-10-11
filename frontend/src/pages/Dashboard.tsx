import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard, type StatKey } from "@/components/ui/stat-tile";
import { ArticleFeed } from "@/components/feed/ArticleFeed";
import { ErrorState } from "@/components/ui/states";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";
import { api, type ChallengeSummary, type Profile } from "@/lib/api";

export default function Dashboard() {
  const navigate = useNavigate();
  const { me } = useSession();
  const { t, lang } = useLanguage();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [featured, setFeatured] = useState<ChallengeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setProfile(await api.profile().catch(() => null));
  }, []);

  useEffect(() => {
    Promise.all([api.profile(), api.challenges().catch(() => [] as ChallengeSummary[])])
      .then(([me_, challenges]) => {
        setProfile(me_);
        setFeatured(challenges.find((c) => !c.completed) ?? challenges[0] ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("dashboard.loadError")));
  }, [lang]);

  const stats: Array<{
    stat: StatKey;
    label: string;
    value: string;
    to: string;
  }> = useMemo(
    () => [
      {
        stat: "rank",
        label: t("dashboard.statRank"),
        value: profile ? `#${profile.rank}` : "—",
        to: "/leaderboard",
      },
      {
        stat: "streak",
        label: t("dashboard.statStreak"),
        value: profile ? `${profile.streak_days}` : "—",
        to: "/profile",
      },
      {
        stat: "points",
        label: t("dashboard.statPoints"),
        value: profile ? profile.points.toLocaleString() : "—",
        to: "/leaderboard",
      },
      {
        stat: "badges",
        label: t("dashboard.statBadges"),
        value: profile ? String(profile.badge_count) : "—",
        to: "/profile?tab=badges",
      },
    ],
    [profile, t]
  );

  const greeting = me
    ? `${t("dashboard.welcome")}, ${me.full_name.split(" ")[0]} 👋`
    : `${t("dashboard.welcome")} 👋`;

  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="font-display text-3xl font-bold md:text-4xl">{greeting}</h1>
          <p className="mt-1 text-muted-foreground">
            {profile && profile.streak_days > 1
              ? t("dashboard.streakKeepGoing", { n: profile.streak_days })
              : t("dashboard.streakStart")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/learn">
            <Button variant="outline">{t("dashboard.aiTraining")}</Button>
          </Link>
          <Link to="/imaging">
            <Button variant="outline">{t("dashboard.imagingWorkbench")}</Button>
          </Link>
        </div>
      </header>

      {error && <ErrorState message={error} />}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((item) => (
          <Link key={item.label} to={item.to} className="block h-full">
            <StatCard
              stat={item.stat}
              label={item.label}
              value={item.value}
            />
          </Link>
        ))}
      </div>

      {featured && (
        <Card className="mb-10 overflow-hidden p-0 shadow-medium">
          <div className="gradient-primary p-6 text-primary-foreground md:p-8">
            <Badge className="bg-white/20 text-white">{t("dashboard.featuredChallenge")}</Badge>
            <h3 className="mt-3 font-display text-xl font-bold">{featured.title}</h3>
            <p className="mt-2 max-w-xl text-primary-foreground/90">{featured.description}</p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button
                variant="outline"
                className="border-white/30 bg-white text-primary hover:bg-white/90"
                onClick={() => navigate(`/challenges/${featured.slug}`)}
              >
                {featured.joined ? t("dashboard.continueChallenge") : t("dashboard.joinChallenge")}
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="flex items-center gap-1.5 text-sm">
                <Clock className="h-4 w-4" />
                {featured.question_count} {t("dashboard.questions")} · {featured.points}{" "}
                {t("dashboard.pts")}
              </span>
              <span className="flex items-center gap-1.5 text-sm">
                <Users className="h-4 w-4" />
                {featured.participants.toLocaleString()} {t("dashboard.joined")}
              </span>
            </div>
          </div>
        </Card>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-bold">{t("dashboard.latestFeed")}</h2>
          <Link to="/feed">
            <Button variant="link" size="sm">
              {t("dashboard.openFeed")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* The same component Your Feed renders, cut to a preview. */}
        <ArticleFeed compact limit={3} onSavedChange={() => void loadProfile()} />
      </section>
    </>
  );
}
