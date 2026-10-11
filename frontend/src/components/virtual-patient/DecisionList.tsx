import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { VpOption } from "@/lib/api";

/**
 * The clinical actions on offer.
 *
 * A radiogroup rather than a row of buttons: these are mutually exclusive
 * choices, so arrow keys should move between them and the group should take a
 * single tab stop. Lettering (A, B, C) gives each option a stable name a
 * student can refer to, and gives the keyboard something to aim at.
 *
 * Correct and incorrect are never signalled by colour alone — each carries an
 * icon and a word.
 */
export function DecisionList({
  prompt,
  options,
  selectedKey,
  verdict,
  busy,
  disabled,
  onChoose,
}: {
  prompt: string;
  options: VpOption[];
  /** The option the student picked, once they have. */
  selectedKey?: string | null;
  /** Set after the server answers. Never inferred on the client. */
  verdict?: { correct: boolean; harmful: boolean } | null;
  busy?: boolean;
  disabled?: boolean;
  onChoose: (key: string) => void;
}) {
  const { t } = useLanguage();
  const locked = Boolean(busy || disabled || selectedKey);

  return (
    <div>
      <p id="vp-prompt" className="font-display text-lg font-bold">
        {prompt}
      </p>

      <div
        role="radiogroup"
        aria-labelledby="vp-prompt"
        aria-busy={busy || undefined}
        className="mt-4 space-y-2"
      >
        {options.map((option, index) => {
          const letter = String.fromCharCode(65 + index);
          const chosen = selectedKey === option.key;
          const showVerdict = chosen && verdict;

          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={chosen}
              // Only the chosen option stays tabbable once locked, so focus
              // does not wander through decisions that can no longer be made.
              tabIndex={locked && !chosen ? -1 : 0}
              disabled={locked && !chosen}
              onClick={() => !locked && onChoose(option.key)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                !locked && "hover:border-primary/40 hover:bg-muted",
                locked && !chosen && "opacity-45",
                chosen && !verdict && "border-primary bg-primary/5",
                showVerdict && verdict?.correct && "border-success/50 bg-success/5 vp-correct",
                showVerdict && !verdict?.correct && "border-warning/50 bg-warning/5 vp-incorrect",
                !chosen && "border-border bg-card"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                  chosen ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
                aria-hidden="true"
              >
                {chosen && busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : letter}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{option.label}</span>
                {option.detail && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {option.detail}
                  </span>
                )}
              </span>

              {showVerdict && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-xs font-semibold",
                    verdict?.correct ? "text-success" : "text-warning"
                  )}
                >
                  {verdict?.correct ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  )}
                  {verdict?.correct
                    ? t("virtualPatient.correct")
                    : verdict?.harmful
                      ? t("virtualPatient.harmful")
                      : t("virtualPatient.notIdeal")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
