import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MessageSquare, Send, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { formatDateTime, useLanguage } from "@/lib/i18n";
import {
  api,
  type CommunityDetail,
  type CommunityMessage,
} from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * A community, opened: description and the conversation.
 *
 * No member roster here — a list of avatars and names does not scale past a
 * handful of people, and these communities run into the hundreds. Member
 * count is a number in the header; the room itself is just the chat.
 */
export default function CommunityRoom() {
  const { slug = "" } = useParams();
  const toast = useToast();
  const { t, lang } = useLanguage();

  const [community, setCommunity] = useState<CommunityDetail | null>(null);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, thread] = await Promise.all([
        api.community(slug),
        api.communityMessages(slug),
      ]);
      setCommunity(detail);
      setMessages(thread);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("room.loadError"));
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load, lang]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !community) return;
    setSending(true);
    try {
      const message = await api.postCommunityMessage(slug, draft.trim());
      setMessages((current) => [...current, message]);
      setDraft("");
      if (!community.joined) {
        // Posting joins you, so reflect that rather than leaving stale state.
        setCommunity({ ...community, joined: true, can_post: true });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t("room.sendError"), "error");
    } finally {
      setSending(false);
    }
  }

  async function toggleMembership() {
    if (!community) return;
    try {
      const updated = community.joined
        ? await api.leaveCommunity(slug)
        : await api.joinCommunity(slug);
      setCommunity({ ...community, ...updated });
      toast(
        updated.joined
          ? t("communities.joinedToast", { name: updated.name })
          : t("communities.leftToast", { name: updated.name })
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.thatDidNotWork"), "error");
    }
  }

  if (loading) return <LoadingState label={t("room.opening")} />;

  if (error || !community) {
    return (
      <ErrorState
        title={t("room.loadError")}
        message={error ?? undefined}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <>
      <Link
        to="/community"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("room.backToCommunities")}
      </Link>

      <Card className="mb-6 p-6 shadow-medium">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-3xl">
              <Icon name={community.icon} className="h-6 w-6 text-primary" />
              {community.name}
            </h1>
            <p className="mt-1 text-muted-foreground">{community.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="muted">{community.specialty}</Badge>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {community.members.toLocaleString()} {t("communities.members")}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4" />
                {messages.length} {t("communities.messages")}
              </span>
            </div>
          </div>
          <Button variant={community.joined ? "outline" : "default"} onClick={() => void toggleMembership()}>
            {community.joined ? t("room.leaveCommunity") : t("room.joinCommunity")}
          </Button>
        </div>
      </Card>

      <Card className="flex h-[min(60vh,32rem)] flex-col p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-display font-bold">{t("room.noMessages")}</h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                {t("room.startConversation")}
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-3", message.mine && "flex-row-reverse")}
            >
              <Avatar name={message.author} className="h-9 w-9 shrink-0" />
              <div className={cn("max-w-[80%]", message.mine && "text-right")}>
                <div
                  className={cn(
                    "flex items-center gap-2 text-xs text-muted-foreground",
                    message.mine && "justify-end"
                  )}
                >
                  <span className="font-semibold text-foreground">{message.author}</span>
                  {message.author_role !== "student" && (
                    <Badge variant="info">{message.author_role}</Badge>
                  )}
                  <span>{formatDateTime(message.created_at, lang)}</span>
                </div>
                <div
                  className={cn(
                    "mt-1.5 inline-block whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-left text-sm",
                    message.mine
                      ? "gradient-primary text-primary-foreground"
                      : "border border-border bg-muted/40"
                  )}
                >
                  {message.body}
                </div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-border p-4">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("room.messagePlaceholder", { name: community.name })}
            aria-label={t("room.messageAria")}
          />
          <Button type="submit" disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="hidden sm:inline">{t("room.send")}</span>
          </Button>
        </form>
      </Card>

      {!community.joined && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("room.sendingJoins")}
        </p>
      )}
    </>
  );
}
