import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

/**
 * Shown in place of a premium item's reader or player.
 *
 * The server withholds the file and stream links for a premium item unless
 * the account may open it (`locked` in the library response), so this is the
 * only thing there is to render — not a curtain over content already sent.
 */
export function PremiumLock({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 px-6 py-16 text-center ${className}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
        <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="font-display text-lg font-bold">{t("common.lockedTitle")}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{t("common.lockedBody")}</p>
      <Link to="/premium">
        <Button>{t("common.seePremium")}</Button>
      </Link>
    </div>
  );
}
