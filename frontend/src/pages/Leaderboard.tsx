import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Medal, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/avatar";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { api, type LeaderboardRow, type Profile } from "@/lib/api";
import { cn } from "@/lib/utils";

const medalColor = ["text-warning", "text-muted-foreground", "text-accent"];

/** Ranking straight from the points table — nothing here is hardcoded. */
export default function Leaderboard() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [board, me] = await Promise.all([api.leaderboard(50), api.profile()]);
      setRows(board);
      setProfile(me);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("leaderboard.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <Link
        to="/profile"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("nav.profile")}
      </Link>

      <PageHeader
        title={t("leaderboard.title")}
        subtitle={t("leaderboard.subtitle")}
      />

      {error && <ErrorState message={error} onRetry={() => void load()} />}
      {loading && <LoadingState label={t("leaderboard.loading")} />}

      {!loading && profile && (
        <Card className="mb-6 p-6 shadow-medium">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Trophy className="h-7 w-7" aria-hidden="true" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Your position</div>
                <div className="font-display text-2xl font-bold">
                  #{profile.rank}{" "}
                  <span className="text-base font-medium text-muted-foreground">
                    of {profile.total_users}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-2xl font-bold text-primary">
                {profile.points.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">points</div>
            </div>
          </div>
        </Card>
      )}

      {!loading && (
        <Card className="divide-y divide-border p-0">
          {rows.map((row) => (
            <div
              key={`${row.user_id}-${row.rank}`}
              className={cn(
                "flex items-center gap-4 px-5 py-4 transition-colors",
                row.you && "bg-primary/5"
              )}
            >
              <div className="w-10 shrink-0 text-center">
                {row.rank <= 3 ? (
                  <Medal className={cn("mx-auto h-6 w-6", medalColor[row.rank - 1])} />
                ) : (
                  <span className="font-display font-bold text-muted-foreground">
                    #{row.rank}
                  </span>
                )}
              </div>
              <Avatar src={row.avatar_url || undefined} name={row.name} className="h-10 w-10 shrink-0 text-xs" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold">{row.name}</span>
                  {row.you && <Badge>You</Badge>}
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
          {rows.length === 0 && (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground">
              Nobody has scored yet. Answer a challenge question to open the board.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
