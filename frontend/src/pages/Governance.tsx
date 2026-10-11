import { useEffect, useState } from "react";
import {
  ShieldCheck, ShieldAlert, Activity, TrendingUp, Loader2, AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  api, type AuditEvent, type GovernanceSummary, type SafetyStandard, type RiskLevel,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const riskStyles: Record<RiskLevel, string> = {
  none: "muted",
  low: "success",
  medium: "warning",
  high: "accent",
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function Governance() {
  const [summary, setSummary] = useState<GovernanceSummary | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [standard, setStandard] = useState<SafetyStandard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.summary(), api.audit({ limit: 40 }), api.standard()])
      .then(([s, e, std]) => {
        setSummary(s);
        setEvents(e);
        setStandard(std);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load audit data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading audit trail…
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Card className="p-6">
        <h2 className="font-display font-bold">Could not load the audit trail</h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </Card>
    );
  }

  const stats = [
    {
      label: "AI interactions",
      value: summary.total_ai_interactions,
      hint: "last 30 days",
      icon: Activity,
      tone: "text-primary",
    },
    {
      label: "Human override rate",
      value: pct(summary.override_rate),
      hint: summary.override_rate === 0 ? "nobody is disagreeing" : "humans disagreeing with AI",
      icon: TrendingUp,
      tone: summary.override_rate === 0 ? "text-destructive" : "text-success",
    },
    {
      label: "Requests blocked",
      value: summary.blocked_count,
      hint: `${pct(summary.block_rate)} of interactions`,
      icon: ShieldAlert,
      tone: "text-warning",
    },
    {
      label: "Disclaimer coverage",
      value: pct(summary.disclaimer_coverage),
      hint: "must always be 100%",
      icon: ShieldCheck,
      tone: summary.disclaimer_coverage === 1 ? "text-success" : "text-destructive",
    },
  ];

  return (
    <>
      <PageHeader
        title="Governance"
        subtitle="Every AI interaction on this platform, and what the humans did about it"
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5 card-hover">
            <stat.icon className={cn("h-5 w-5", stat.tone)} />
            <div className={cn("mt-3 font-display text-2xl font-bold", stat.tone)}>{stat.value}</div>
            <div className="mt-0.5 text-sm font-medium">{stat.label}</div>
            <div className="text-xs text-muted-foreground">{stat.hint}</div>
          </Card>
        ))}
      </div>

      {summary.override_rate === 0 && summary.total_ai_interactions > 5 && (
        <Card className="mb-8 border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h3 className="font-display font-bold">Possible automation bias</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Not one AI suggestion has been overridden. Either the model is flawless, or
                people have stopped reading the images. The second is far more likely.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h3 className="font-display font-bold">Certification</h3>
          <div className="mt-3 font-display text-3xl font-bold text-gradient">
            {summary.total_users}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            users cleared to use AI-assisted analysis
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-display font-bold">Low-confidence outputs</h3>
          <div className="mt-3 font-display text-3xl font-bold text-warning">
            {summary.low_confidence_count}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            below the {pct(summary.confidence_threshold)} threshold — flagged, not shown as results
          </p>
        </Card>
        <Card className="p-5">
          <h3 className="font-display font-bold">Awaiting review</h3>
          <div className="mt-3 font-display text-3xl font-bold text-accent">
            {summary.pending_review}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">escalated to a human, not yet cleared</p>
        </Card>
      </div>

      {standard && (
        <>
          <h2 className="mb-4 font-display text-2xl font-bold">The safety standard</h2>
          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {standard.rules.map((rule) => (
              <Card key={rule.id} className="p-5">
                <div className="flex items-center gap-2">
                  <Badge variant="solid">{rule.id}</Badge>
                  <h3 className="font-display font-bold">{rule.title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{rule.rule}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Enforced by <code className="rounded bg-muted px-1">{rule.enforced_by}</code>
                </p>
              </Card>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-4 font-display text-2xl font-bold">Audit trail</h2>
      <Card className="divide-y divide-border p-0">
        {events.map((event) => (
          <div key={event.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span className="w-36 shrink-0 text-xs text-muted-foreground">
              {new Date(event.created_at).toLocaleString()}
            </span>
            <Badge variant={event.blocked ? "accent" : (riskStyles[event.risk_level] as never)}>
              {event.event_type.replace(/_/g, " ")}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-sm">
              {event.user_name ?? `User ${event.user_id ?? "—"}`}
              {event.ai_output_summary && (
                <span className="text-muted-foreground"> · {event.ai_output_summary}</span>
              )}
            </span>
            {event.confidence != null && (
              <span
                className={cn(
                  "shrink-0 text-xs font-semibold",
                  event.confidence < summary.confidence_threshold
                    ? "text-destructive"
                    : "text-success"
                )}
              >
                {pct(event.confidence)}
              </span>
            )}
            {event.overridden && <Badge variant="warning">overridden</Badge>}
            {event.requires_review && <Badge variant="accent">needs review</Badge>}
          </div>
        ))}
        {events.length === 0 && (
          <p className="px-5 py-12 text-center text-muted-foreground">No audit events yet.</p>
        )}
      </Card>
    </>
  );
}
