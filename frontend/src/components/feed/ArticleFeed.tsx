import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, Heart, MessageCircle, Search, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Cover } from "@/components/ui/cover";
import { ProviderCredit } from "@/components/ui/photo-credit";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { api, type ArticleSummary } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Filter values stay in English — they are the exact `tag` the API filters
   and searches on — and are only translated for display, via FILTER_LABEL. */
const FILTERS = ["All", "Medical News", "Study Tip", "Upcoming Event", "Sponsored"];
const FILTER_KEY: Record<string, string> = {
  All: "feed.tagAll",
  "Medical News": "feed.tagMedicalNews",
  "Study Tip": "feed.tagStudyTip",
  "Upcoming Event": "feed.tagUpcomingEvent",
  Sponsored: "feed.tagSponsored",
};

/**
 * The feed, in one place.
 *
 * Used full-size on Your Feed and cut down to a preview on the Dashboard, so
 * the two can never drift into behaving differently.
 */
/**
 * The box a cover is given, chosen by the shape the server says it is.
 *
 * These are ratios, not pixel sizes: the column is a fixed 160px and the image
 * is `h-auto`, so the numbers only decide how tall the slot is before the file
 * arrives — which is what stops the row reflowing as covers load. The browser
 * cannot know an image's dimensions until it has fetched it, so the shape is
 * stored alongside the article rather than measured here.
 */
const COVER_BOX: Record<string, { w: number; h: number }> = {
  landscape: { w: 360, h: 200 },
  portrait: { w: 240, h: 320 },
  square: { w: 280, h: 280 },
};

/**
 * The box a cover gets, in order of how much we trust the source.
 *
 * A stock provider returns the photograph's true pixel dimensions, so when they
 * are present they win outright — the slot then matches the file exactly and
 * nothing is cropped or padded. An authored cover has no dimensions travelling
 * with it, so it falls back to the stored orientation, and to landscape if even
 * that is missing.
 */
function coverBox(article: ArticleSummary): { w: number; h: number } {
  const { width, height } = article.image ?? {};
  if (width && height) return { w: width, h: height };
  return COVER_BOX[article.cover_orientation] ?? COVER_BOX.landscape;
}

export function ArticleFeed({
  compact = false,
  limit,
  onSavedChange,
}: {
  /** Preview mode: no search or filters, just the cards. */
  compact?: boolean;
  limit?: number;
  /** Lets a parent refresh counts that depend on the Saved collection. */
  onSavedChange?: () => void;
}) {
  const toast = useToast();
  const { t, lang } = useLanguage();

  const relative = useCallback(
    (iso: string): string => {
      const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
      if (minutes < 60) return t("common.minAgo", { n: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return t("common.hoursAgo", { n: hours });
      const days = Math.round(hours / 24);
      return t("common.daysAgo", { n: days });
    },
    [t]
  );

  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounce = useRef<number>();
  const touched = useRef(false);

  const load = useCallback(async (nextQuery: string, nextFilter: string) => {
    setSearching(true);
    try {
      setArticles(await api.articles({ q: nextQuery, tag: nextFilter }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("feed.loadError"));
    } finally {
      setSearching(false);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load("", "All");
  }, [load, lang]);

  // Search runs on the server so it can look inside article bodies. Debounced
  // so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (loading) return;
    if (!touched.current) {
      touched.current = true;
      return;
    }
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(query, filter), 220);
    return () => window.clearTimeout(debounce.current);
  }, [query, filter, loading, load]);

  async function toggleSave(article: ArticleSummary) {
    const next = !article.saved;
    setArticles((current) =>
      current.map((item) => (item.id === article.id ? { ...item, saved: next } : item))
    );
    try {
      if (next) await api.save("article", article.slug);
      else await api.unsave("article", article.slug);
      toast(next ? t("common.savedToCollection") : t("common.removedFromSaved"));
      onSavedChange?.();
    } catch (e) {
      setArticles((current) =>
        current.map((item) => (item.id === article.id ? { ...item, saved: !next } : item))
      );
      toast(e instanceof Error ? e.message : t("common.couldNotSave"), "error");
    }
  }

  async function toggleLike(article: ArticleSummary) {
    try {
      const updated = await api.toggleLike(article.slug);
      setArticles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("article.registerError"), "error");
    }
  }

  async function share(article: ArticleSummary) {
    // The real, openable URL of this article — not a placeholder.
    const url = `${window.location.origin}/feed/${article.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("common.linkCopied"));
    } catch {
      // Clipboard access needs a secure context; fall back rather than fail silently.
      window.prompt(t("common.copyThisLink"), url);
    }
  }

  const visible = limit ? articles.slice(0, limit) : articles;

  return (
    <>
      {!compact && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("feed.searchPlaceholder")}
                className="pl-9"
                aria-label={t("feed.searchAria")}
              />
            </div>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">{t("feed.searchHint")}</p>

          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {FILTERS.map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={cn(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  filter === item
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {t(FILTER_KEY[item] ?? item)}
              </button>
            ))}
          </div>
        </>
      )}

      {error && <ErrorState message={error} onRetry={() => void load(query, filter)} />}

      {loading ? (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          {!compact && <SkeletonCard />}
        </div>
      ) : (
        <div className={cn("space-y-4 transition-opacity", searching && "opacity-60")}>
          {visible.map((article) => (
            <Card key={article.id} className="overflow-hidden p-0 card-hover animate-fade-in">
              <div className="flex flex-col gap-5 p-6 sm:flex-row">
              <Link
                to={`/feed/${article.slug}`}
                tabIndex={-1}
                aria-hidden="true"
                /* self-start is the fix for the blank space under short covers:
                   a flex child stretches to the row height by default, so the
                   bordered box ran the full height of the text beside it while
                   the image sat at its own. Now the box ends where the image
                   does, whatever shape it is. */
                className="hidden w-40 shrink-0 self-start overflow-hidden rounded-xl border border-border sm:block"
              >
                <Cover
                  src={article.cover}
                  alt={article.cover_alt}
                  width={coverBox(article).w}
                  height={coverBox(article).h}
                />
              </Link>
              <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant={article.tag === "Sponsored" ? "muted" : "default"}>
                  {t(FILTER_KEY[article.tag] ?? article.tag)}
                </Badge>
                <span className="text-muted-foreground">{relative(article.published_at)}</span>
                <span className="text-muted-foreground">
                  · {t("article.minRead", { n: article.read_minutes })}
                </span>
              </div>

              <Link to={`/feed/${article.slug}`} className="group block">
                <h3 className="mt-3 font-display text-lg font-bold leading-snug group-hover:text-primary">
                  {article.title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{article.excerpt}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {t("feed.readArticle")}
                  <ChevronRight className="h-4 w-4" />
                </span>
              </Link>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <span className="text-sm font-medium">
                  {article.author}
                  {article.author_role && (
                    <span className="text-muted-foreground"> · {article.author_role}</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => void toggleLike(article)}
                    aria-pressed={article.liked}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <Heart className={cn("h-4 w-4", article.liked && "fill-accent text-accent")} />
                    {article.like_count}
                  </button>
                  <Link
                    to={`/feed/${article.slug}#comments`}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
                    aria-label={t("feed.commentAria", { title: article.title })}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {article.comment_count}
                  </Link>
                  <button
                    onClick={() => void share(article)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                    aria-label={t("feed.copyLinkAria")}
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => void toggleSave(article)}
                    aria-pressed={article.saved}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted"
                    aria-label={article.saved ? t("library.removeFromSavedAria") : t("common.save")}
                  >
                    <Bookmark
                      className={cn("h-4 w-4", article.saved && "fill-primary text-primary")}
                    />
                  </button>
                </div>
              </div>
              </div>
              </div>
            </Card>
          ))}

          {visible.length === 0 && !error && (
            <EmptyState
              icon={<Search className="h-8 w-8" />}
              title={t("feed.noMatch")}
              body={
                query
                  ? t("feed.noMatchQueryBody", { query })
                  : t("feed.noMatchFilterBody")
              }
              action={
                !compact && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setFilter("All");
                    }}
                  >
                    {t("common.clearSearch")}
                  </Button>
                )
              }
            />
          )}
        </div>
      )}

      {/* Pexels asks for a visible credit wherever their photos appear. Shown
          only when one actually is. */}
      {visible.some((a) => a.image?.provider === "pexels") && (
        <ProviderCredit className="pt-1" />
      )}
    </>
  );
}
