import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, BookOpen, Brain, Zap, Check, Crown, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import { premium } from "@/data/content";
import { cn } from "@/lib/utils";

const icons = { users: Users, book: BookOpen, brain: Brain, zap: Zap } as const;

export default function Premium() {
  const navigate = useNavigate();
  const toast = useToast();
  const { me, refresh } = useSession();
  const [selected, setSelected] = useState(
    premium.plans.find((p) => p.popular)?.id ?? premium.plans[0].id
  );
  const [busy, setBusy] = useState(false);

  const isPremium = Boolean(me?.is_premium);

  /**
   * Demo checkout. No payment provider is wired up and none is implied — but
   * the flag it flips is the same one the community-creation endpoint checks,
   * so the upgrade actually changes what the account can do.
   */
  async function choosePlan(planId: string) {
    setSelected(planId);
    setBusy(true);
    try {
      if (isPremium) {
        await api.cancelPremium();
        await refresh();
        toast("Premium cancelled");
      } else {
        await api.activatePremium();
        await refresh();
        toast("Premium activated — you can now create communities");
        navigate("/community");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update your plan", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="mb-10 text-center animate-fade-up">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-accent shadow-glow">
          <Crown className="h-8 w-8 text-accent-foreground" />
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold md:text-4xl">
          {isPremium ? "You are on Premium" : premium.title}
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
          {isPremium
            ? "Community creation is unlocked on your account. Manage your plan below."
            : premium.subtitle}
        </p>
        {isPremium && (
          <Badge className="mt-3" variant="accent">
            <Crown className="h-3 w-3" />
            Premium active
          </Badge>
        )}
      </header>

      <div className="mb-12 grid gap-4 sm:grid-cols-2">
        {premium.benefits.map((b) => {
          const Icon = icons[b.icon as keyof typeof icons];
          return (
            <Card key={b.title} className="flex gap-4 p-5 card-hover">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-bold">{b.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{b.body}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mb-12 grid gap-5 sm:grid-cols-2">
        {premium.plans.map((p) => {
          const active = selected === p.id;
          return (
            <Card
              key={p.id}
              className={cn(
                "relative flex flex-col p-7 transition-all",
                active ? "ring-2 ring-primary shadow-medium" : "card-hover"
              )}
            >
              {p.popular && (
                <Badge variant="solid" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
              )}
              <h3 className="font-display text-xl font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="font-display text-4xl font-bold text-gradient">{p.price}</span>
                <span className="pb-1.5 text-muted-foreground">{p.period}</span>
              </div>
              <Button
                className="mt-6 w-full"
                variant={p.popular ? "accent" : "outline"}
                disabled={busy}
                onClick={() => void choosePlan(p.id)}
              >
                {busy && active && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPremium ? "Cancel Premium" : p.cta}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="p-7">
        <h2 className="font-display text-xl font-bold">{premium.includedTitle}</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {premium.included.map((item) => (
            <li key={item} className="flex items-center gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15">
                <Check className="h-3 w-3 text-success" />
              </span>
              <span className="text-sm">{item}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
