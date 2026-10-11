import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The one Go Premium treatment.
 *
 * Every upgrade affordance in the app renders this, so the paywall reads as a
 * single thing rather than four differently-styled buttons. Sized to match
 * the neutral sidebar buttons (Settings, nav items) so the two read as a
 * matched pair in layout while the gradient keeps Premium visually distinct
 * as the accent CTA.
 */
const CLASSES =
  "inline-flex items-center justify-center gap-3 rounded-xl px-4 py-2.5 text-sm font-bold text-white " +
  "bg-[linear-gradient(135deg,#F97316,#F59E0B)] shadow-lg shadow-orange-500/30 " +
  "transition-all duration-200 hover:scale-105 hover:bg-[linear-gradient(135deg,#FB8C3A,#FBBF24)] " +
  "hover:shadow-xl hover:shadow-orange-500/40 active:scale-95 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

export function PremiumButton({
  label,
  to = "/premium",
  className,
  onClick,
}: {
  label?: string;
  to?: string;
  className?: string;
  onClick?: () => void;
}) {
  const { t } = useLanguage();
  const text = label ?? t("nav.premium");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(CLASSES, className)}>
        <Crown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {text}
      </button>
    );
  }
  return (
    <Link to={to} className={cn(CLASSES, className)}>
      <Crown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      {text}
    </Link>
  );
}
