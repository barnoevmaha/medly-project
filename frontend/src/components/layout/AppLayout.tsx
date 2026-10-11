import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { TranslationNote } from "./TranslationNote";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { getToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";

export function AppLayout() {
  const location = useLocation();
  const { me, loading } = useSession();
  const { t } = useLanguage();

  // Every route inside this layout calls the API, and the API is authenticated.
  // Without this check an unauthenticated visit renders a page full of 401
  // errors instead of a sign-in prompt.
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Session bootstrap: `/api/auth/me` runs once before children render, so a
  // stale token is detected and redirected before a single page of 401s shows.
  if (loading && !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm font-medium">{t("common.loadingWorkspace")}</span>
        </div>
      </div>
    );
  }

  // Bootstrap finished and still no user: the token was present but rejected.
  // Without this the layout renders children over a dead session and every page
  // fills with 401s — the exact failure this check exists to prevent.
  if (!me) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <MobileNav />
      <main id="main" className="px-4 pb-24 pt-6 md:ml-64 md:px-8 md:pb-10">
        <div className="mx-auto max-w-5xl">
          <TranslationNote />
          <Outlet />
        </div>
      </main>
      <AssistantWidget />
    </div>
  );
}
