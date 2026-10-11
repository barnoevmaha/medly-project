import {
  Baby, Bone, Brain, Cpu, Flame, GraduationCap, HeartPulse, Library, MessageSquare,
  Pill, Scan, ScanEye, Scissors, ShieldCheck, Siren, Sprout, Stethoscope, Target,
  Trophy, Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon names the API is allowed to send.
 *
 * A fixed map rather than a dynamic import: the set is small, the bundle stays
 * tree-shaken, and a typo in seed data renders the fallback instead of crashing
 * the page.
 */
const ICONS: Record<string, LucideIcon> = {
  baby: Baby,
  bone: Bone,
  brain: Brain,
  cpu: Cpu,
  flame: Flame,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  library: Library,
  "message-square": MessageSquare,
  pill: Pill,
  scan: Scan,
  "scan-eye": ScanEye,
  scissors: Scissors,
  "shield-check": ShieldCheck,
  siren: Siren,
  sprout: Sprout,
  stethoscope: Stethoscope,
  target: Target,
  trophy: Trophy,
  users: Users,
};

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: string;
  className?: string;
}) {
  const Component = ICONS[name] ?? Stethoscope;
  return <Component className={className} aria-hidden="true" />;
}

/**
 * The tinted square an icon sits in.
 *
 * One implementation so every section tile has the same size, radius and
 * weight — and a flat tint rather than a gradient, because twenty gradient
 * tiles on one screen is noise.
 */
export function IconTile({
  name,
  className = "",
  size = "md",
}: {
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  const glyph = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div
      className={`flex ${box} shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ${className}`}
    >
      <Icon name={name} className={glyph} />
    </div>
  );
}
