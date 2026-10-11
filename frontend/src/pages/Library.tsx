import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bookmark, BookOpen, Crown, FileText, Newspaper, Play, Search, SlidersHorizontal,
  Star, Trash2, Video, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Cover } from "@/components/ui/cover";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import {
  api,
  type LibraryResource,
  type SavedEntry,
  type SavedType,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type TabKey = "video" | "book" | "saved";

/**
 * The shape a card's thumbnail takes. A book keeps the 3:4 of a printed cover;
 * a video takes the proportions it was shot in, so a landscape lecture and a
 * vertical clip are not both squeezed into the same box. Intrinsic width and
 * height go to <Cover> as well as the class, which is what keeps the row from
 * reflowing while the image loads.
 */
function thumbOf(resource: LibraryResource) {
  if (resource.kind !== "video") return { w: 180, h: 240, cls: "w-24" };
  return resource.orientation === "portrait"
    ? { w: 180, h: 320, cls: "w-20 sm:w-24" }
    : { w: 320, h: 180, cls: "w-36 sm:w-40" };
}

/** Videos open the player, everything else opens the reader. */
function openPath(resource: { kind: string; slug: string }) {
  return resource.kind === "video" ? `/watch/${resource.slug}` : `/read/${resource.slug}`;
}
const TYPE_ICON: Record<SavedType, typeof BookOpen> = {
  article: Newspaper,
  book: BookOpen,
  pdf: FileText,
  video: Video,
};

/**
 * Library — everything available, plus what this student kept.
 *
 * Saved is a tab here rather than a nav entry of its own: it is a view of the
 * library filtered to your bookmarks, not a separate place. Saving never
 * removes anything from its type tab.
 *
 * Filtering is one derived state — { query, year, tab } — combined with AND
 * logic in a single useMemo, so search, year and tab always agree with each
 * other rather than three separate filters drifting out of sync.
 */
export default function Library() {
  const toast = useToast();
  const { t, lang } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TabKey) ?? "video";

  const TABS: Array<{ key: TabKey; label: string; icon: typeof Video }> = [
    { key: "video", label: t("library.videos"), icon: Video },
    { key: "book", label: t("library.books"), icon: BookOpen },
    { key: "saved", label: t("library.saved"), icon: Bookmark },
  ];
  const CTA: Record<string, string> = {
    video: t("common.watch"),
    book: t("common.read"),
    pdf: t("common.read"),
  };
  const LEVEL_LABEL: Record<string, string> = {
    foundation: t("library.levelFoundation"),
    clinical: t("library.levelClinical"),
    advanced: t("library.levelAdvanced"),
  };

  const [resources, setResources] = useState<LibraryResource[]>([]);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, savedList, savedCounts] = await Promise.all([
        api.resources(),
        api.saved(),
        api.savedCounts(),
      ]);
      setResources(list);
      setSaved(savedList);
      setCounts(savedCounts);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("library.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load, lang]);

  const topics = useMemo(
    () => Array.from(new Set(resources.map((r) => r.topic).filter(Boolean))).sort(),
    [resources]
  );
  const levels = useMemo(
    () => Array.from(new Set(resources.map((r) => r.level).filter(Boolean))).sort(),
    [resources]
  );
  /* Years come from the catalogue, newest first — no hardcoded list. */
  const years = useMemo(
    () =>
      Array.from(new Set(resources.map((r) => r.year).filter((v): v is number => !!v))).sort(
        (a, b) => b - a
      ),
    [resources]
  );

  const needle = query.trim().toLowerCase();
  const activeFilters = [level, topic, year].filter(Boolean).length + (needle ? 1 : 0);

  /* One filter state — query, year, tab — combined with AND logic. Year is a
     "since" threshold (item.year >= selected), not an exact match, so picking
     2023 surfaces everything published in or after 2023. */
  const visibleResources = useMemo(
    () =>
      resources.filter(
        (r) =>
          (tab === "saved" || r.kind === tab) &&
          (!level || r.level === level) &&
          (!topic || r.topic === topic) &&
          (!year || (r.year ?? 0) >= year) &&
          (!needle ||
            `${r.title} ${r.author} ${r.description} ${r.publisher} ${r.topic}`
              .toLowerCase()
              .includes(needle))
      ),
    [resources, tab, level, topic, year, needle]
  );

  const visibleSaved = useMemo(
    () =>
      saved.filter(
        (s) => !needle || `${s.title} ${s.subtitle} ${s.description}`.toLowerCase().includes(needle)
      ),
    [saved, needle]
  );

  function clearFilters() {
    setLevel(null);
    setTopic(null);
    setYear(null);
    setQuery("");
  }

  async function refreshSaved() {
    const [savedList, savedCounts] = await Promise.all([api.saved(), api.savedCounts()]);
    setSaved(savedList);
    setCounts(savedCounts);
  }

  async function toggleResource(resource: LibraryResource) {
    const next = !resource.saved;
    setResources((current) =>
      current.map((item) => (item.id === resource.id ? { ...item, saved: next } : item))
    );
    try {
      if (next) await api.save(resource.kind, resource.slug);
      else await api.unsave(resource.kind, resource.slug);
      toast(next ? t("library.savedToast") : t("common.removedFromSaved"));
      await refreshSaved();
    } catch (e) {
      setResources((current) =>
        current.map((item) => (item.id === resource.id ? { ...item, saved: !next } : item))
      );
      toast(e instanceof Error ? e.message : t("common.couldNotSave"), "error");
    }
  }

  async function removeSaved(entry: SavedEntry) {
    setSaved((current) => current.filter((item) => item.id !== entry.id));
    try {
      await api.unsave(entry.item_type, entry.item_key);
      toast(t("common.removedFromSaved"));
      setResources((current) =>
        current.map((item) => (item.slug === entry.item_key ? { ...item, saved: false } : item))
      );
      setCounts(await api.savedCounts());
    } catch (e) {
      toast(e instanceof Error ? e.message : t("library.removeError"), "error");
      void load();
    }
  }

  const tabCount = (key: TabKey) =>
    key === "saved" ? counts.all ?? 0 : resources.filter((r) => r.kind === key).length;

  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.subtitle")} />

      {/* ---------------- search + filters ---------------- */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("library.search")}
            className="pl-9"
            aria-label={t("library.search")}
            type="search"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("library.filter")}
          {activeFilters > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
              {activeFilters}
            </span>
          )}
        </Button>
        {/* "Clear" only exists while something is filtered. */}
        {activeFilters > 0 && (
          <Button variant="ghost" onClick={clearFilters}>
            {t("library.clearAll")}
          </Button>
        )}
      </div>

      {filtersOpen && (levels.length > 0 || topics.length > 0 || years.length > 0) && (
        <Card className="mb-4 p-5 animate-fade-up">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display font-bold">{t("library.filters")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("library.filtersHint")}</p>
            </div>
            <button
              onClick={() => setFiltersOpen(false)}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
              aria-label={t("common.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("library.level")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {levels.map((value) => (
                <button
                  key={value}
                  onClick={() => setLevel(level === value ? null : value)}
                  aria-pressed={level === value}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                    level === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {LEVEL_LABEL[value] ?? value}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("library.year")}
            </span>
            <select
              value={year ?? ""}
              onChange={(event) =>
                setYear(event.target.value ? Number(event.target.value) : null)
              }
              className="mt-2 h-11 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-soft outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="">{t("library.allYears")}</option>
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("library.subject")}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {topics.map((value) => (
                <button
                  key={value}
                  onClick={() => setTopic(topic === value ? null : value)}
                  aria-pressed={topic === value}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    topic === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        </Card>
      )}

      {/* Active filter chips */}
      {activeFilters > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {needle && (
            <Badge variant="muted">
              “{query.trim()}”
              <button onClick={() => setQuery("")} aria-label={t("common.clearSearch")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {level && (
            <Badge variant="muted">
              <span className="capitalize">{LEVEL_LABEL[level] ?? level}</span>
              <button onClick={() => setLevel(null)} aria-label={t("library.removeFilterAria", { value: level })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {topic && (
            <Badge variant="muted">
              {topic}
              <button onClick={() => setTopic(null)} aria-label={t("library.removeFilterAria", { value: topic })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {year && (
            <Badge variant="muted">
              {year}+
              <button onClick={() => setYear(null)} aria-label={t("library.removeFilterAria", { value: year })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

      {/* ---------------- tabs ---------------- */}
      <div
        className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
        role="tablist"
        aria-label={t("library.sectionsAria")}
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === "video" ? {} : { tab: key })}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            <span className="opacity-70">{tabCount(key)}</span>
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : tab === "saved" ? (
        /* ---------------- saved ---------------- */
        visibleSaved.length === 0 ? (
          <EmptyState
            icon={<Bookmark className="h-8 w-8" />}
            title={needle ? t("library.nothingSavedMatches") : t("library.nothingSaved")}
            body={t("library.savedHint")}
            action={
              <Button onClick={() => setParams({})}>
                <Video className="h-4 w-4" aria-hidden="true" />
                {t("library.browseVideos")}
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleSaved.map((entry) => {
              const Icon = TYPE_ICON[entry.item_type];
              return (
                <Card key={entry.id} className="flex gap-4 p-4 card-hover animate-fade-in">
                  <div className="w-20 shrink-0 overflow-hidden rounded-lg border border-border">
                    <Cover src={entry.cover} width={180} height={240} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Badge variant="muted" className="self-start">
                      <Icon className="h-3 w-3" aria-hidden="true" />
                      {entry.item_type}
                    </Badge>
                    <h3 className="mt-2 font-display font-bold leading-snug">{entry.title}</h3>
                    {entry.subtitle && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{entry.subtitle}</p>
                    )}
                    {entry.meta && (
                      <p className="mt-2 text-xs text-muted-foreground">{entry.meta}</p>
                    )}
                    <div className="mt-auto flex gap-2 pt-4">
                      <Link
                        to={
                          entry.item_type === "video"
                            ? `/watch/${entry.item_key}`
                            : entry.item_type === "article"
                            ? entry.href
                            : `/read/${entry.item_key}`
                        }
                        className="flex-1"
                      >
                        <Button className="w-full" size="sm">
                          {entry.item_type === "video" ? t("common.watch") : t("common.read")}
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void removeSaved(entry)}
                        aria-label={t("library.removeSavedAria", { title: entry.title })}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        {t("common.remove")}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : /* ---------------- videos and books ---------------- */
      visibleResources.length === 0 ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title={t("library.nothingMatches")}
          body={t("library.tryDifferent")}
          action={
            activeFilters > 0 ? (
              <Button variant="outline" onClick={clearFilters}>
                {t("library.clearAll")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleResources.map((resource) => {
            const thumb = thumbOf(resource);
            return (
            <Card key={resource.id} className="flex gap-4 p-4 card-hover animate-fade-in">
              <Link
                to={openPath(resource)}
                aria-label={`${CTA[resource.kind] ?? t("common.open")} ${resource.title}`}
                className={cn(
                  "relative shrink-0 self-start overflow-hidden rounded-lg border border-border",
                  thumb.cls
                )}
              >
                <Cover src={resource.cover} width={thumb.w} height={thumb.h} />
                {resource.kind === "video" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition-colors hover:bg-black/35">
                    <Play className="h-6 w-6 fill-white text-white" aria-hidden="true" />
                  </span>
                )}
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  {resource.level && (
                    <Badge variant="muted" className="capitalize">
                      {LEVEL_LABEL[resource.level] ?? resource.level}
                    </Badge>
                  )}
                  {resource.premium && (
                    <Badge variant="accent">
                      <Crown className="h-3 w-3" aria-hidden="true" />
                      {t("common.premium")}
                    </Badge>
                  )}
                </div>

                <h3 className="mt-2 font-display font-bold leading-snug">{resource.title}</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">{resource.author}</p>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {resource.description}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden="true" />
                    {resource.rating}
                  </span>
                  {resource.topic && <span>{resource.topic}</span>}
                  {resource.year ? <span>{resource.year}</span> : null}
                  {resource.pages ? <span>{t("library.pagesCount", { n: resource.pages })}</span> : null}
                  {resource.duration ? <span>{resource.duration}</span> : null}
                </div>

                <div className="mt-auto flex gap-2 pt-4">
                  <Link to={openPath(resource)} className="flex-1">
                    <Button className="w-full" size="sm">
                      {CTA[resource.kind] ?? t("common.open")}
                      <span className="sr-only"> {resource.title}</span>
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant={resource.saved ? "outline" : "default"}
                    onClick={() => void toggleResource(resource)}
                    aria-pressed={resource.saved}
                    aria-label={
                      resource.saved
                        ? t("library.removeFromSavedAria")
                        : t("library.saveAria", { title: resource.title })
                    }
                  >
                    <Bookmark
                      className={cn("h-4 w-4", resource.saved && "fill-current")}
                      aria-hidden="true"
                    />
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
