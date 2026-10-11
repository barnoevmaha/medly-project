import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { useProvideAiContext } from "@/lib/ai-context";
import { api, type LibraryResource } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Placeholder stream, used when a resource has no `video_url` of its own.
 * Swapping in real per-item URLs is a data change, not a code change.
 */
const FALLBACK_EMBED =
  "https://www.youtube.com/embed/22kfs9PwBgY?list=PLGO4HdV8zhh9IlOWz4QvMBV8ZEa_TbdPn";

/** Turn a watch URL into an embed URL; anything already embeddable passes through. */
function toEmbed(url: string): string {
  if (!url) return FALLBACK_EMBED;
  if (url.includes("/embed/")) return url;
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("v");
    const list = parsed.searchParams.get("list");
    if (!id) return url;
    return `https://www.youtube.com/embed/${id}${list ? `?list=${list}` : ""}`;
  } catch {
    return FALLBACK_EMBED;
  }
}

export default function Watch() {
  const { slug = "" } = useParams();
  const toast = useToast();
  const { t, lang } = useLanguage();
  const LEVEL_LABEL: Record<string, string> = {
    foundation: t("library.levelFoundation"),
    clinical: t("library.levelClinical"),
    advanced: t("library.levelAdvanced"),
  };
  const [resource, setResource] = useState<LibraryResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The library item on screen becomes the assistant's context.
  useProvideAiContext(
    resource ? { kind: "resource", key: resource.slug, label: resource.title } : null
  );

  async function load() {
    setLoading(true);
    try {
      const list = await api.resources();
      setResource(list.find((item) => item.slug === slug) ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("watch.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, lang]);

  async function toggleSave() {
    if (!resource) return;
    const next = !resource.saved;
    setResource({ ...resource, saved: next });
    try {
      if (next) await api.save("video", resource.slug);
      else await api.unsave("video", resource.slug);
      toast(next ? t("common.saved") : t("common.removedFromSaved"));
    } catch (e) {
      setResource({ ...resource, saved: !next });
      toast(e instanceof Error ? e.message : t("common.couldNotSave"), "error");
    }
  }

  if (loading) return <LoadingState label={t("watch.loading")} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!resource) {
    return (
      <ErrorState
        title={t("watch.notFoundTitle")}
        message={t("watch.notFoundBody")}
        onRetry={() => void load()}
      />
    );
  }

  // A 9:16 clip in a 16:9 box is two black pillars around a postage stamp, so
  // vertical sources get a vertical frame. The height cap is what stops a tall
  // video pushing the title and the save button off the first screen.
  const portrait = resource.orientation === "portrait";

  return (
    <>
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("nav.library")}
      </Link>

      <Card className="overflow-hidden p-0 shadow-medium">
        <div
          className={cn(
            "bg-black",
            portrait
              ? "mx-auto aspect-[9/16] h-[min(70vh,32rem)] max-w-full"
              : "aspect-video w-full"
          )}
        >
          <iframe
            src={toEmbed(resource.video_url)}
            title={resource.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>

        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold">{resource.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{resource.author}</p>
            </div>
            <Button
              variant={resource.saved ? "outline" : "default"}
              onClick={() => void toggleSave()}
              aria-pressed={resource.saved}
            >
              <Bookmark
                className={cn("h-4 w-4", resource.saved && "fill-current")}
                aria-hidden="true"
              />
              {resource.saved ? t("common.saved") : t("common.save")}
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {resource.level && (
              <Badge variant="muted" className="capitalize">
                {LEVEL_LABEL[resource.level] ?? resource.level}
              </Badge>
            )}
            {resource.topic && <Badge variant="muted">{resource.topic}</Badge>}
            {resource.duration && <Badge variant="muted">{resource.duration}</Badge>}
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-4 w-4 fill-warning text-warning" aria-hidden="true" />
              {resource.rating}
            </span>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">{resource.description}</p>
        </div>
      </Card>
    </>
  );
}
