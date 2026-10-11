import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { useProvideAiContext } from "@/lib/ai-context";
import { api, type LibraryResource } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Placeholder document, used when a resource has no `pdf_url` of its own. */
const FALLBACK_PDF = "https://api.ziyonet.uz/uploads/books/49959/55d597ec00c54.pdf";

export default function Read() {
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
      setError(e instanceof Error ? e.message : t("read.loadError"));
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
      if (next) await api.save(resource.kind, resource.slug);
      else await api.unsave(resource.kind, resource.slug);
      toast(next ? t("common.saved") : t("common.removedFromSaved"));
    } catch (e) {
      setResource({ ...resource, saved: !next });
      toast(e instanceof Error ? e.message : t("common.couldNotSave"), "error");
    }
  }

  if (loading) return <LoadingState label={t("read.opening")} />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!resource) {
    return (
      <ErrorState
        title={t("read.notFoundTitle")}
        message={t("read.notFoundBody")}
        onRetry={() => void load()}
      />
    );
  }

  const source = resource.pdf_url || FALLBACK_PDF;

  return (
    <>
      <Link
        to="/library"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("nav.library")}
      </Link>

      <Card className="mb-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold">{resource.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {resource.author}
              {resource.publisher ? ` · ${resource.publisher}` : ""}
              {resource.year ? ` · ${resource.year}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {resource.level && (
                <Badge variant="muted" className="capitalize">
                  {LEVEL_LABEL[resource.level] ?? resource.level}
                </Badge>
              )}
              {resource.topic && <Badge variant="muted">{resource.topic}</Badge>}
              {resource.pages ? (
                <Badge variant="muted">{t("library.pagesCount", { n: resource.pages })}</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={source} target="_blank" rel="noreferrer">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {t("read.openNewTab")}
              </Button>
            </a>
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
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <iframe
          src={source}
          title={`${resource.title} — reader`}
          className="h-[75vh] w-full"
          loading="lazy"
        />
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        {t("read.blockedHint")}{" "}
        <a href={source} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {t("read.openNewTab")}
        </a>
        .
      </p>
    </>
  );
}
