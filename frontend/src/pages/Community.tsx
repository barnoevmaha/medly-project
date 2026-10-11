import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check, Loader2, Lock, MessageSquare, Plus, Search, Users, X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Icon } from "@/components/ui/icon";
import { PremiumButton } from "@/components/ui/premium-button";
import { Cover } from "@/components/ui/cover";
import { useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState, SkeletonCard } from "@/components/ui/states";
import { useLanguage } from "@/lib/i18n";
import { ApiError, api, type CommunityPermissions, type CommunitySummary } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function Community() {
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useLanguage();

  const FILTERS = [
    { key: "All", label: t("communities.filterAll") },
    { key: "My Communities", label: t("communities.filterMine") },
    { key: "Popular", label: t("communities.filterPopular") },
    { key: "New", label: t("communities.filterNew") },
  ];

  const [communities, setCommunities] = useState<CommunitySummary[]>([]);
  const [permissions, setPermissions] = useState<CommunityPermissions | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", specialty: "" });
  const [creating, setCreating] = useState(false);
  const debounce = useRef<number>();
  const touched = useRef(false);

  // Search is scoped server-side to the name and the description under it.
  const load = useCallback(async (nextQuery: string, nextFilter: string) => {
    try {
      setCommunities(await api.communities({ q: nextQuery, filter: nextFilter }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("communities.loadError"));
    }
  }, [t]);

  useEffect(() => {
    Promise.all([api.communities(), api.communityPermissions()])
      .then(([list, perms]) => {
        setCommunities(list);
        setPermissions(perms);
      })
      .catch((e) => setError(e instanceof Error ? e.message : t("communities.loadError")))
      .finally(() => setLoading(false));
  }, [lang]);

  useEffect(() => {
    if (loading) return;
    if (!touched.current) {
      touched.current = true;
      return;
    }
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(query, filter), 200);
    return () => window.clearTimeout(debounce.current);
  }, [query, filter, loading, load]);

  async function toggleMembership(community: CommunitySummary) {
    try {
      const updated = community.joined
        ? await api.leaveCommunity(community.slug)
        : await api.joinCommunity(community.slug);
      setCommunities((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      toast(
        updated.joined
          ? t("communities.joinedToast", { name: updated.name })
          : t("communities.leftToast", { name: updated.name })
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : t("common.thatDidNotWork"), "error");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await api.createCommunity({
        name: form.name.trim(),
        description: form.description.trim(),
        specialty: form.specialty.trim() || "General",
      });
      toast(t("communities.createdToast", { name: created.name }));
      setComposing(false);
      setForm({ name: "", description: "", specialty: "" });
      navigate(`/community/${created.slug}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        // The server is the authority here; the UI just reports what it said.
        toast(e.message, "error");
        setComposing(false);
        navigate("/premium");
      } else {
        toast(e instanceof Error ? e.message : t("communities.createError"), "error");
      }
    } finally {
      setCreating(false);
    }
  }

  const canCreate = permissions?.can_create ?? false;

  return (
    <>
      <PageHeader
        title={t("communities.title")}
        subtitle={t("communities.subtitle")}
        action={
          canCreate ? (
            <Button onClick={() => setComposing((value) => !value)}>
              {composing ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {composing ? t("communities.cancel") : t("communities.create")}
            </Button>
          ) : (
            <PremiumButton label={t("communities.premiumToCreate")} />
          )
        }
      />

      {!canCreate && permissions && (
        <Card className="mb-6 border-accent/30 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
            <div>
              <h3 className="font-display font-bold">{t("communities.premiumFeatureTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("communities.premiumFeatureBody")}
              </p>
              <PremiumButton className="mt-3" />
            </div>
          </div>
        </Card>
      )}

      {composing && canCreate && (
        <Card className="mb-6 p-6 animate-fade-up">
          <h3 className="font-display text-lg font-bold">{t("communities.new")}</h3>
          <form onSubmit={create} className="mt-4 space-y-3">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("communities.namePlaceholder")}
              required
              minLength={3}
              aria-label={t("communities.namePlaceholder")}
            />
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder={t("communities.descPlaceholder")}
              required
              minLength={10}
              aria-label={t("communities.descriptionLabel")}
            />
            <Input
              value={form.specialty}
              onChange={(event) => setForm({ ...form, specialty: event.target.value })}
              placeholder={t("communities.specialtyPlaceholder")}
              aria-label={t("communities.specialtyLabel")}
            />
            <Button type="submit" disabled={creating}>
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("communities.createButton")}
            </Button>
          </form>
        </Card>
      )}

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("communities.searchPlaceholder")}
          className="pl-9"
          aria-label={t("communities.searchPlaceholder")}
        />
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            onClick={() => setFilter(item.key)}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              filter === item.key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(query, filter)} />}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : communities.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={t("communities.notFound")}
          body={
            query
              ? t("communities.noMatchQuery", { query })
              : t("communities.noMatchFilter")
          }
          action={
            <Button variant="outline" onClick={() => { setQuery(""); setFilter("All"); }}>
              {t("communities.clearSearch")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {communities.map((community) => (
            <Card
              key={community.id}
              className="flex flex-col overflow-hidden p-0 card-hover animate-fade-in"
            >
              <Link to={`/community/${community.slug}`} tabIndex={-1} aria-hidden="true">
                <Cover
                  src={community.cover}
                  width={360}
                  height={160}
                  fit="crop"
                  className="border-b border-border"
                />
              </Link>
              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/community/${community.slug}`} className="group min-w-0">
                  <h3 className="flex items-center gap-2 font-display text-lg font-bold group-hover:text-primary">
                    <Icon name={community.icon} className="h-5 w-5 shrink-0 text-primary" />
                    <span className="truncate">{community.name}</span>
                  </h3>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {community.owned && <Badge variant="accent">{t("communities.yours")}</Badge>}
                  {community.joined && (
                    <Badge variant="success">
                      <Check className="h-3 w-3" />
                      {t("communities.joined")}
                    </Badge>
                  )}
                </div>
              </div>

              <p className="mt-2 text-sm text-muted-foreground">{community.description}</p>

              <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  {community.members.toLocaleString()} {t("communities.members")}
                </span>
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  {community.messages} {t("communities.messages")}
                </span>
              </div>

              <div className="mt-auto flex gap-2 pt-5">
                <Link to={`/community/${community.slug}`} className="flex-1">
                  <Button className="w-full">{t("communities.openChat")}</Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={() => void toggleMembership(community)}
                >
                  {community.joined ? t("communities.leave") : t("communities.join")}
                </Button>
              </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
