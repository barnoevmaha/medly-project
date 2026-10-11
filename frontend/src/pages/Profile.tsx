import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Award, BookMarked, ChevronRight, Crown, GraduationCap, Lock, MessageSquare,
  Trophy, Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { PremiumButton } from "@/components/ui/premium-button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import {
  api,
  type ActivityRow,
  type BadgeState,
  type CommunitySummary,
  type Profile as ProfileData,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "badges" | "communities" | "activity";

export default function Profile() {
  // The tab lives in the URL so the Dashboard can link straight to the badges
  // section rather than dropping the user on a generic profile page.
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) ?? "overview";
  const { t, lang } = useLanguage();

  function relative(iso: string): string {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutes < 60) return t("common.minAgo", { n: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t("common.hoursAgo", { n: hours });
    const days = Math.round(hours / 24);
    return t("common.daysAgo", { n: days });
  }

  const TABS: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: t("profile.overview") },
    { key: "badges", label: t("profile.badges") },
    { key: "communities", label: t("profile.communities") },
    { key: "activity", label: t("profile.activity") },
  ];

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [badges, setBadges] = useState<BadgeState[]>([]);
  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [me, badgeList, joined, recent] = await Promise.all([
        api.profile(),
        api.badges(),
        api.myCommunities(),
        api.activity(15),
      ]);
      setProfile(me);
      setBadges(badgeList);
      setCommunities(joined);
      setActivity(recent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("profile.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [lang]);

  const stats = useMemo(
    () => [
      {
        value: profile ? `#${profile.rank}` : "—",
        label: t("profile.globalRank"),
        to: "/leaderboard",
        hint: t("profile.openLeaderboardHint"),
      },
      {
        value: profile ? profile.points.toLocaleString() : "—",
        label: t("profile.totalPoints"),
        to: "/leaderboard",
        hint: t("profile.openLeaderboardHint"),
      },
      {
        value: profile ? String(profile.badge_count) : "—",
        label: t("profile.badgesEarned"),
        to: "/profile?tab=badges",
        hint: t("profile.viewBadgesHint"),
      },
      {
        value: profile ? String(profile.community_count) : "—",
        label: t("profile.communities"),
        to: "/profile?tab=communities",
        hint: t("profile.viewCommunitiesHint"),
      },
    ],
    [profile, t]
  );

  if (loading) return <LoadingState label={t("profile.loading")} />;
  if (error || !profile) {
    return <ErrorState message={error ?? undefined} onRetry={() => void load()} />;
  }

  return (
    <>
      <Card className="mb-8 p-6 shadow-medium animate-fade-up md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <Avatar
            src={profile.avatar_url || undefined}
            name={profile.name}
            className="h-24 w-24 border-4 border-card text-2xl md:h-28 md:w-28"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold md:text-3xl">{profile.name}</h1>
              {profile.is_premium && (
                <Badge variant="accent">
                  <Crown className="h-3 w-3" />
                  {t("common.premium")}
                </Badge>
              )}
              {profile.role !== "student" && <Badge variant="info">{profile.role}</Badge>}
            </div>
            <p className="mt-0.5 text-muted-foreground">{profile.handle}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.institution || "Medly"}
              {profile.year_of_study
                ? ` · ${t("profile.yearLabel", { n: profile.year_of_study })}`
                : ""}
            </p>
          </div>

          <div className="flex gap-2">
            <Link to="/leaderboard">
              <Button variant="outline">
                <Trophy className="h-4 w-4" />
                {t("profile.rank")}
              </Button>
            </Link>
            {!profile.is_premium && <PremiumButton />}
          </div>
        </div>
      </Card>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} to={stat.to} title={stat.hint} className="block">
            <Card className="h-full p-5 text-center card-hover">
              <div className="font-display text-2xl font-bold text-gradient">{stat.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setParams(item.key === "overview" ? {} : { tab: item.key })}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              tab === item.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-display font-bold">
              <GraduationCap className="h-4 w-4 text-primary" />
              {t("profile.learning")}
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.lessonsCompleted")}</dt>
                <dd className="font-semibold">{profile.lessons_completed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.challengesStarted")}</dt>
                <dd className="font-semibold">{profile.challenges_completed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.currentStreak")}</dt>
                <dd className="font-semibold">
                  {t("profile.streakDaysCount", { n: profile.streak_days })}
                </dd>
              </div>
            </dl>
            <Link to="/learn">
              <Button className="mt-4 w-full" variant="outline" size="sm">
                {t("profile.continueTraining")}
              </Button>
            </Link>
          </Card>

          <Card className="p-5">
            <h3 className="flex items-center gap-2 font-display font-bold">
              <BookMarked className="h-4 w-4 text-accent" />
              {t("profile.libraryDiscussion")}
            </h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.savedItems")}</dt>
                <dd className="font-semibold">{profile.saved_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.commentsWritten")}</dt>
                <dd className="font-semibold">{profile.comments}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("profile.communitiesJoined")}</dt>
                <dd className="font-semibold">{profile.community_count}</dd>
              </div>
            </dl>
            <Link to="/library?tab=saved">
              <Button className="mt-4 w-full" variant="outline" size="sm">
                {t("profile.openSaved")}
              </Button>
            </Link>
          </Card>
        </div>
      )}

      {tab === "badges" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">{t("profile.badges")}</h2>
            <span className="text-sm text-muted-foreground">
              {t("profile.badgesEarnedOf", {
                earned: badges.filter((badge) => badge.earned).length,
                total: badges.length,
              })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {badges.map((badge) => (
              <Card
                key={badge.key}
                className={cn(
                  "p-5 text-center card-hover",
                  !badge.earned && "opacity-60"
                )}
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  {badge.earned ? (
                    <Icon name={badge.icon} />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold">{badge.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {badge.earned && badge.earned_at
                    ? t("profile.earnedOn", { date: new Date(badge.earned_at).toLocaleDateString(lang) })
                    : badge.hint}
                </div>
              </Card>
            ))}
          </div>
          {badges.every((badge) => !badge.earned) && (
            <Card className="mt-4 p-5">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("profile.badgesHint2")}</p>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === "communities" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-bold">
              {t("profile.communities")}
            </h2>
            <Link to="/community">
              <Button variant="link" size="sm">
                {t("profile.findMore")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {communities.length === 0 ? (
            <Card className="p-8 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-display font-bold">{t("profile.notJoined")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("profile.notJoinedHint")}</p>
              <Link to="/community">
                <Button className="mt-4">{t("profile.browseCommunities")}</Button>
              </Link>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {communities.map((community) => (
                <Link key={community.id} to={`/community/${community.slug}`}>
                  <Card className="h-full p-5 card-hover">
                    <h3 className="flex items-center gap-2 font-display text-lg font-bold">
                      <Icon name={community.icon} className="h-5 w-5 text-primary" />
                      {community.name}
                    </h3>
                    <p className="mt-2 text-sm text-muted-foreground">{community.description}</p>
                    <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {community.members.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4" />
                        {community.messages}
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "activity" && (
        <>
          <h2 className="mb-4 font-display text-2xl font-bold">{t("profile.recentActivity")}</h2>
          {activity.length === 0 ? (
            <Card className="p-8 text-center">
              <Award className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-display font-bold">{t("profile.nothingRecorded")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("profile.nothingRecordedHint")}
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {activity.map((row, index) => (
                <div
                  key={`${row.text}-${index}`}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{row.text}</div>
                    <div className="text-sm text-muted-foreground">
                      {row.detail} · {relative(row.at)}
                    </div>
                  </div>
                  {row.points ? (
                    <Badge variant="success">+{row.points}</Badge>
                  ) : (
                    <Badge variant="muted">{t("common.done")}</Badge>
                  )}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}
