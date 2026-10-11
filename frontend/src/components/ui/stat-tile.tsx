import { Flame, Star, Target, Trophy, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Stat tiles — one definition, two layouts.
 *
 * `StatCard` is the stacked form (icon top-left, then label, value, detail)
 * used by the Dashboard, where each stat carries its own accent so the four
 * cards read as four different things at a glance.
 *
 * `StatRow` is the horizontal form (icon left, value and label right) used by
 * Challenges, where the three numbers are the same kind of thing and share
 * one teal accent.
 *
 * Colours are fixed per stat so the same number always looks the same wherever
 * it appears. Hex rather than theme tokens because these are brand-level
 * constants specified alongside the icons.
 */
export type StatKey = "rank" | "streak" | "points" | "badges";

type Accent = { color: string; background: string };

/** Shared teal, matching the app's primary. */
export const TEAL: Accent = { color: "#0F9B96", background: "#E3F4F3" };

export const STAT_STYLE: Record<StatKey, Accent & { icon: LucideIcon; label: string }> = {
  // warm orange
  rank: { icon: Trophy, color: "#E08A3C", background: "#FDF2E4", label: "Rank" },
  // teal / turquoise
  points: { icon: Target, color: "#0F9B96", background: "#E3F4F3", label: "Points" },
  // coral
  streak: { icon: Flame, color: "#EF6B57", background: "#FDECE9", label: "Streak" },
  // blue
  badges: { icon: Star, color: "#3B82F6", background: "#E8F0FE", label: "Badges" },
};

/** Rounded square, very light tint, icon centred in the accent colour. */
function IconSquare({
  icon: Icon,
  accent,
  size = "lg",
  className,
}: {
  icon: LucideIcon;
  accent: Accent;
  /** `sm` = 56px for the stacked cards, `lg` = 80px for the wide rows. */
  size?: "sm" | "lg";
  className?: string;
}) {
  const small = size === "sm";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center",
        small
          ? "h-14 w-14 rounded-2xl"
          : "h-16 w-16 rounded-[18px] sm:h-20 sm:w-20 sm:rounded-[20px]",
        className
      )}
      style={{ backgroundColor: accent.background }}
      aria-hidden="true"
    >
      <Icon
        className={small ? "h-6 w-6" : "h-7 w-7 sm:h-8 sm:w-8"}
        strokeWidth={2}
        color={accent.color}
      />
    </span>
  );
}

/** Kept as a named export — small icon-only badge, reusable outside the cards. */
export function StatIcon({ stat }: { stat: StatKey }) {
  const { icon, ...accent } = STAT_STYLE[stat];
  return <IconSquare icon={icon} accent={accent} />;
}

/**
 * Stacked card: tinted icon, then the label, then the value. Fills its grid
 * cell so a row of them is always the same height.
 *
 * There was a fourth line under the value — a green gloss such as "of 8
 * students" or "earned from challenges & quizzes". It restated what the label
 * already said and gave four cards a ragged bottom edge, so the card now ends
 * on the number it exists to show.
 */
export function StatCard({
  stat,
  value,
  label,
  className,
}: {
  stat: StatKey;
  value: string;
  label?: string;
  className?: string;
}) {
  const { icon, label: fallbackLabel, ...accent } = STAT_STYLE[stat];
  return (
    <Card className={cn("h-full rounded-[20px] p-5 card-hover", className)}>
      <IconSquare icon={icon} accent={accent} size="sm" />
      <div className="mt-4 text-sm text-muted-foreground">{label ?? fallbackLabel}</div>
      <div className="mt-1.5 font-display text-3xl font-bold leading-none text-foreground">
        {value}
      </div>
    </Card>
  );
}

/**
 * Horizontal card: icon on the left, value over label on the right, the pair
 * vertically centred. Same shape on every breakpoint — the layout does not
 * need to change for a phone, only the grid around it does.
 */
export function StatRow({
  icon,
  value,
  label,
  accent = TEAL,
  className,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  accent?: Accent;
  className?: string;
}) {
  return (
    <Card className={cn("flex h-full items-center gap-5 rounded-[24px] p-6 card-hover", className)}>
      <IconSquare icon={icon} accent={accent} />
      <div className="min-w-0">
        <div className="font-display text-3xl font-bold leading-none text-foreground">{value}</div>
        <div className="mt-2 text-sm font-normal text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

/**
 * Centred card: bare coloured icon on top, value, then label.
 *
 * No tinted square here — at three-across the icon has room to be the only
 * colour on the card, and dropping the container is what keeps the row light.
 */
export function StatCentered({
  icon: Icon,
  value,
  label,
  color,
  className,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  /** Accent for the icon. Everything else stays neutral. */
  color: string;
  className?: string;
}) {
  return (
    <Card className={cn("h-full rounded-[20px] p-6 text-center card-hover", className)}>
      <Icon
        className="mx-auto h-7 w-7"
        strokeWidth={2}
        color={color}
        aria-hidden="true"
      />
      <div className="mt-4 font-display text-2xl font-bold leading-none text-foreground">
        {value}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{label}</div>
    </Card>
  );
}

/** Backwards-compatible alias for the older inline tile. */
export const StatTile = StatRow;
