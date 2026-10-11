import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDown, ArrowUp, Droplet, HeartPulse, Thermometer, TriangleAlert, Wind } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";
import type { PatientState, VpVitals } from "@/lib/api";

/**
 * How the patient is doing, and the numbers behind it.
 *
 * The condition is shown three ways on purpose — a filled bar, a word, and a
 * colour — because colour alone cannot carry "critical" for a colour-blind
 * reader, and a bar alone cannot say which direction things are moving.
 */

/* Presentation only. The wording lives in the virtualPatient namespace so a
   condition reads naturally in every language rather than being a translated
   English adjective. */
const STATE: Record<
  PatientState,
  { key: string; fill: number; bar: string; badge: string }
> = {
  recovered: { key: "Recovered", fill: 100, bar: "bg-success", badge: "success" },
  improving: { key: "Improving", fill: 80, bar: "bg-success", badge: "success" },
  stable: { key: "Stable", fill: 60, bar: "bg-primary", badge: "default" },
  deteriorating: { key: "Deteriorating", fill: 35, bar: "bg-warning", badge: "warning" },
  critical: { key: "Critical", fill: 15, bar: "bg-destructive", badge: "accent" },
  failed: { key: "Failed", fill: 0, bar: "bg-destructive", badge: "accent" },
};

/** Only the observations the backend actually sent are rendered.
 *
 *  Ranges are the ordinary adult reference bands, held as [min, max] rather
 *  than a predicate so the card can say *which way* a value is out — "low" and
 *  "high" are different clinical stories and a single "abnormal" flag loses
 *  that. Blood pressure is judged on the systolic figure of a "120/80" string. */
const VITALS: Array<{
  key: string;
  label: string;
  icon: typeof HeartPulse;
  unit?: string;
  range?: [number, number];
  /** Pulls the number to judge out of a non-numeric reading. */
  read?: (raw: unknown) => number | null;
}> = [
  { key: "hr", label: "HR", icon: HeartPulse, unit: "bpm", range: [60, 100] },
  {
    key: "bp",
    label: "BP",
    icon: Activity,
    unit: "mmHg",
    range: [90, 180],
    read: (raw) => {
      const systolic = Number(String(raw ?? "").split("/")[0]);
      return Number.isFinite(systolic) ? systolic : null;
    },
  },
  { key: "rr", label: "RR", icon: Wind, unit: "/min", range: [12, 20] },
  { key: "spo2", label: "SpO₂", icon: Droplet, unit: "%", range: [94, 100] },
  { key: "temp", label: "Temp", icon: Thermometer, unit: "°C", range: [36, 37.5] },
  { key: "gcs", label: "GCS", icon: Activity, range: [15, 15] },
];

export function ConditionMeter({
  state,
  vitals,
  className,
}: {
  state: PatientState;
  vitals?: VpVitals;
  className?: string;
}) {
  const { t } = useLanguage();
  const info = STATE[state] ?? STATE.stable;
  const label = t(`virtualPatient.state${info.key}`);
  const note = t(`virtualPatient.state${info.key}Note`);
  const present = VITALS.filter(
    (v) => vitals?.[v.key] !== undefined && vitals?.[v.key] !== null
  );

  /* Which numbers just moved, and which way. A student should be able to see
     that the saturations fell without holding the previous screen in memory —
     the arrow says it, the highlight draws the eye, and both fade. */
  const previous = useRef<VpVitals | undefined>(vitals);
  const [changed, setChanged] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    const before = previous.current;
    previous.current = vitals;
    if (!before || !vitals) return;

    const moved: Record<string, "up" | "down"> = {};
    for (const { key } of VITALS) {
      const a = before[key];
      const b = vitals[key];
      if (typeof a === "number" && typeof b === "number" && a !== b) {
        moved[key] = b > a ? "up" : "down";
      }
    }
    if (!Object.keys(moved).length) return;
    setChanged(moved);
    const timer = window.setTimeout(() => setChanged({}), 2200);
    return () => window.clearTimeout(timer);
  }, [vitals]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          {t("virtualPatient.conditionLabel")}
        </span>
        <Badge variant={info.badge as never}>{label}</Badge>
      </div>

      <div
        role="meter"
        aria-valuenow={info.fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${t("virtualPatient.conditionLabel")}: ${label}`}
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", info.bar)}
          style={{ width: `${info.fill}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{note}</p>

      {present.length > 0 && (
        <dl className="grid grid-cols-3 gap-2 pt-1">
          {present.map(({ key, label, icon: Icon, unit, range, read }) => {
            const raw = vitals?.[key];
            const judged = read ? read(raw) : typeof raw === "number" ? raw : null;
            const abnormal = judged !== null && range ? judged < range[0] || judged > range[1] : false;
            const moved = changed[key];
            return (
              <div
                key={key}
                // min-w-0 is load-bearing: a grid track defaults to min-content,
                // so without it a long reading like "98/60mmHg" pushes the card
                // wider than its column instead of wrapping inside it.
                className={cn(
                  "min-w-0 rounded-xl border border-border bg-background px-2.5 py-2 transition-colors duration-500",
                  abnormal && "border-warning/40 bg-warning/5",
                  moved && "vp-vital-changed"
                )}
              >
                <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {/* The icon carries the abnormal state as well as the colour,
                      so the card still reads as flagged in greyscale. */}
                  {abnormal ? (
                    <TriangleAlert className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
                  ) : (
                    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{label}</span>
                </dt>
                <dd
                  className={cn(
                    // flex-wrap lets the unit drop under the number rather than
                    // spilling out of the card.
                    "flex flex-wrap items-baseline gap-x-0.5 font-display text-sm font-bold tabular-nums",
                    abnormal && "text-warning"
                  )}
                >
                  <span className="break-all">{String(raw)}</span>
                  {unit && <span className="text-[10px] font-normal">{unit}</span>}
                  {moved && (
                    <>
                      {moved === "up" ? (
                        <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {" "}({t(`virtualPatient.${moved === "up" ? "risen" : "fallen"}`)})
                      </span>
                    </>
                  )}
                  {/* Not colour alone: the icon above shows it, this says it. */}
                  {abnormal && <span className="sr-only"> ({t("virtualPatient.abnormal")})</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
