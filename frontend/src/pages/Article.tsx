import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Bookmark, Clock, Heart, Loader2, MessageCircle, Send, Share2, Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { Avatar } from "@/components/ui/avatar";
import { Cover } from "@/components/ui/cover";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { useProvideAiContext } from "@/lib/ai-context";
import { api, type ArticleDetail } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Tag values stay in English — they are the exact `tag` the API filters on —
   and are only translated for display. */
const TAG_KEY: Record<string, string> = {
  "Medical News": "feed.tagMedicalNews",
  "Study Tip": "feed.tagStudyTip",
  "Upcoming Event": "feed.tagUpcomingEvent",
  Sponsored: "feed.tagSponsored",
};

/**
 * The full article.
 *
 * Opened from a feed card, or from the Comment button on one — in which case
 * the URL carries `#comments` and the page scrolls the composer into view and
 * focuses it.
 */
export default function Article() {
  const { slug = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useLanguage();

  const relative = useCallback(
    (iso: string): string => {
      const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
      if (minutes < 60) return t("common.minAgo", { n: minutes });
      const hours = Math.round(minutes / 60);
      if (hours < 24) return t("common.hoursAgo", { n: hours });
      return new Date(iso).toLocaleDateString(lang);
    },
    [t, lang]
  );

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const commentsRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Medly AI picks this up: the slug travels, the server fetches the body.
  useProvideAiContext(
    article ? { kind: "article", key: article.slug, label: article.title } : null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setArticle(await api.article(slug));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("article.loadError"));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load, lang]);

  useEffect(() => {
    if (loading || !article) return;
    if (location.hash !== "#comments") return;
    // Wait a frame so the body has laid out before measuring the offset.
    const id = window.requestAnimationFrame(() => {
      commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      composerRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [loading, article, location.hash]);

  async function toggleSave() {
    if (!article) return;
    const next = !article.saved;
    setArticle({ ...article, saved: next });
    try {
      if (next) await api.save("article", article.slug);
      else await api.unsave("article", article.slug);
      toast(next ? t("common.savedToCollection") : t("common.removedFromSaved"));
    } catch (e) {
      setArticle({ ...article, saved: !next });
      toast(e instanceof Error ? e.message : t("common.couldNotSave"), "error");
    }
  }

  async function toggleLike() {
    if (!article) return;
    try {
      const updated = await api.toggleLike(article.slug);
      setArticle({ ...article, liked: updated.liked, like_count: updated.like_count });
    } catch (e) {
      toast(e instanceof Error ? e.message : t("article.registerError"), "error");
    }
  }

  async function share() {
    if (!article) return;
    const url = `${window.location.origin}/feed/${article.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("common.linkCopied"));
    } catch {
      window.prompt(t("common.copyThisLink"), url);
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!article || !draft.trim()) return;
    setPosting(true);
    try {
      const comment = await api.addComment(article.slug, draft.trim());
      setArticle({
        ...article,
        comments: [...article.comments, comment],
        comment_count: article.comment_count + 1,
      });
      setDraft("");
      toast(t("article.commentPosted"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("article.commentPostError"), "error");
    } finally {
      setPosting(false);
    }
  }

  async function removeComment(id: number) {
    if (!article) return;
    try {
      await api.deleteComment(id);
      setArticle({
        ...article,
        comments: article.comments.filter((comment) => comment.id !== id),
        comment_count: Math.max(0, article.comment_count - 1),
      });
      toast(t("article.commentDeleted"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("article.commentDeleteError"), "error");
    }
  }

  if (loading) return <LoadingState label={t("article.loading")} />;

  if (error || !article) {
    return (
      <ErrorState
        title={t("article.loadError")}
        message={error ?? undefined}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <article className="mx-auto max-w-3xl">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </button>

      <Card className="overflow-hidden p-0 shadow-medium">
        <Cover
          src={article.cover}
          alt={article.cover_alt}
          width={360}
          height={200}
          className="max-h-56 w-full border-b border-border object-cover"
        />
        <div className="p-6 md:p-10">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant={article.tag === "Sponsored" ? "muted" : "default"}>
            {t(TAG_KEY[article.tag] ?? article.tag)}
          </Badge>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {t("article.minRead", { n: article.read_minutes })}
          </span>
          <span className="text-muted-foreground">{relative(article.published_at)}</span>
        </div>

        <h1 className="mt-4 font-display text-3xl font-bold leading-tight md:text-4xl">
          {article.title}
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">{article.excerpt}</p>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-y border-border py-4">
          <div className="flex items-center gap-3">
            <Avatar name={article.author} className="h-10 w-10" />
            <div>
              <div className="font-semibold">{article.author}</div>
              <div className="text-sm text-muted-foreground">{article.author_role}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void toggleLike()}>
              <Heart className={cn("h-4 w-4", article.liked && "fill-accent text-accent")} />
              {article.like_count}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              <MessageCircle className="h-4 w-4" />
              {article.comment_count}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
              {t("article.share")}
            </Button>
            <Button
              size="sm"
              variant={article.saved ? "default" : "outline"}
              onClick={() => void toggleSave()}
            >
              <Bookmark className={cn("h-4 w-4", article.saved && "fill-current")} />
              {article.saved ? t("common.saved") : t("common.save")}
            </Button>
          </div>
        </div>

        <div className="mt-8">
          <Markdown>{article.body_md}</Markdown>
        </div>
        </div>
      </Card>

      {/* ---------------- comments ---------------- */}
      <div ref={commentsRef} id="comments" className="mt-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-2xl font-bold">
          <MessageCircle className="h-5 w-5 text-primary" />
          {t("article.comments")}
          <span className="text-base font-medium text-muted-foreground">
            ({article.comments.length})
          </span>
        </h2>

        <Card className="p-5">
          <form onSubmit={submitComment}>
            <Textarea
              ref={composerRef}
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("article.commentPlaceholder")}
              aria-label={t("article.writeCommentAria")}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t("article.commentHint")}</p>
              <Button type="submit" disabled={posting || !draft.trim()}>
                {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("article.postComment")}
              </Button>
            </div>
          </form>
        </Card>

        <div className="mt-4 space-y-3">
          {article.comments.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">{t("article.noComments")}</p>
            </Card>
          )}
          {article.comments.map((comment) => (
            <Card key={comment.id} className="p-5 animate-fade-in">
              <div className="flex items-start gap-3">
                <Avatar name={comment.author} className="h-9 w-9 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{comment.author}</span>
                    {comment.author_role !== "student" && (
                      <Badge variant="info">{comment.author_role}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {relative(comment.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm">{comment.body}</p>
                </div>
                {comment.mine && (
                  <button
                    onClick={() => void removeComment(comment.id)}
                    className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                    aria-label={t("article.deleteCommentAria")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/dashboard">
          <Button variant="outline">{t("article.backToFeed")}</Button>
        </Link>
      </div>
    </article>
  );
}
