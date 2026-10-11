import { Link } from "react-router-dom";
import {
  Users, Trophy, BookOpen, Sparkles, ShieldCheck, GraduationCap, Star, ChevronRight,
  ScanLine, Stethoscope, FileLock2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { home } from "@/data/content";
import { site } from "@/config/site";

/* Icon names used by `home.features` in src/data/content.ts. The older four
   are kept so an edit that reaches for them still renders. */
const icons = {
  users: Users,
  trophy: Trophy,
  book: BookOpen,
  sparkles: Sparkles,
  shield: ShieldCheck,
  scan: ScanLine,
  graduation: GraduationCap,
  stethoscope: Stethoscope,
} as const;
const badgeIcons = [ShieldCheck, FileLock2, Star];

export default function Home() {
  return (
    <div className="min-h-screen gradient-hero">
      {/* nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <span className="text-xl font-bold text-primary-foreground">{site.initial}</span>
            </div>
            <span className="font-display text-2xl font-bold text-gradient">{site.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* hero */}
      <section className="px-4 pb-16 pt-32">
        <div className="mx-auto max-w-3xl text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            {home.eyebrow}
          </span>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.1] md:text-6xl">
            {home.headline[0]}
            <br />
            <span className="text-gradient">{home.headline[1]}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">{home.subhead}</p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/dashboard">
              <Button size="lg">
                {home.primaryCta}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="lg" variant="outline">{home.secondaryCta}</Button>
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {home.trustBadges.map((b, i) => {
              const Icon = badgeIcons[i % badgeIcons.length];
              return (
                <li key={b} className="flex items-center gap-1.5">
                  <Icon className="h-4 w-4 text-primary" />
                  {b}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* stats */}
      <section className="px-4 py-12">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-4">
          {home.stats.map((s) => (
            <Card key={s.label} className="p-6 text-center card-hover">
              <div className="font-display text-3xl font-bold text-gradient">{s.value}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* features */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-bold md:text-4xl">{home.featuresTitle}</h2>
            <p className="mt-3 text-muted-foreground">{home.featuresSubtitle}</p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {home.features.map((f) => {
              // A content edit naming an icon that does not exist should cost
              // a generic glyph, not a blank white page.
              const Icon = icons[f.icon as keyof typeof icons] ?? Sparkles;
              return (
                <Card key={f.title} className="p-6 card-hover">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow">
                    <Icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="px-4 py-16">
        <Card className="mx-auto max-w-3xl overflow-hidden p-10 text-center shadow-medium">
          <h2 className="font-display text-3xl font-bold">{home.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted-foreground">{home.ctaBody}</p>
          <Link to="/dashboard" className="mt-7 inline-block">
            <Button size="lg" variant="accent">
              {home.ctaButton}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </section>

      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <span className="text-sm font-bold text-primary-foreground">{site.initial}</span>
            </div>
            <span className="font-display text-lg font-bold text-gradient">{site.name}</span>
          </div>
          <p className="text-sm text-muted-foreground">{site.copyright}</p>
        </div>
      </footer>
    </div>
  );
}
