import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { Languages } from "lucide-react";
import {
  getTranslationStatus,
  resetTranslationStatus,
  subscribeTranslationStatus,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n";

/**
 * One line, when some of what you are reading is English because no
 * translation exists for it.
 *
 * Content translation is machine-generated and cached on first view, so a
 * gap means a provider call failed, not that anyone forgot. Falling back to
 * English is still the right behaviour — the alternative is a blank article —
 * but doing it silently leaves a Russian-speaking student unable to tell a
 * missing translation from an article that is genuinely about English terms.
 *
 * Deliberately not a banner. It sits above the page content in the same
 * muted style as a caption, and it never appears in English.
 */
export function TranslationNote() {
  const { lang, t } = useLanguage();
  const location = useLocation();
  const partial = useSyncExternalStore(
    subscribeTranslationStatus,
    getTranslationStatus,
    () => false
  );

  // Clear on navigation. Child effects fire before this one, but every API
  // response resolves long after both, so the new page's requests always land
  // on a cleared flag.
  useEffect(() => {
    resetTranslationStatus();
  }, [location.pathname]);

  if (lang === "en" || !partial) return null;

  return (
    <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
      <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {t("common.englishFallback")}
    </p>
  );
}
