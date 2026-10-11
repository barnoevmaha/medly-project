import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, MoreHorizontal, Settings, X } from "lucide-react";
import { MOBILE_PRIMARY, navItems, staffNavItems } from "@/config/site";
import { Avatar } from "@/components/ui/avatar";
import { PremiumButton } from "@/components/ui/premium-button";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const primary = MOBILE_PRIMARY.map((to) => navItems.find((item) => item.to === to)!).filter(
  Boolean
);
/** Nav entries that do not fit the bottom bar; they live behind "More". */
const secondary = navItems.filter((item) => !MOBILE_PRIMARY.includes(item.to));

/** Maps each route to its translation key — see Sidebar.tsx for the same table. */
const NAV_KEY: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/community": "nav.communities",
  "/challenges": "nav.challenges",
  "/library": "nav.library",
  "/profile": "nav.profile",
  "/learn": "nav.aiTraining",
  "/imaging/cases": "nav.caseReferences",
  "/governance": "nav.governance",
};

function sheetItemClass(isActive: boolean) {
  return cn(
    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
    isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
  );
}

/**
 * Bottom bar for small screens.
 *
 * Four destinations on the bar, the rest in a sheet — a phone gets a phone's
 * navigation rather than a squeezed copy of the sidebar.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { me, logout } = useSession();
  const { t } = useLanguage();
  const isStaff = me?.role === "instructor" || me?.role === "admin";

  // Close on navigation, or the sheet stays over the page you just opened.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sheet z-[70], above the assistant launcher's z-[60]. The launcher sits
          at 96–152px from the bottom, which lands inside this sheet: at z-50 it
          painted on top of the last row and a half, so a tap at the right-hand
          end of "Log out" opened the assistant instead. The sheet is opaque and
          taller than 152px in every configuration, so raising it hides the
          launcher completely for as long as this is open. */}
      {open && (
        <div className="fixed bottom-16 left-0 right-0 z-[70] max-h-[65vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-medium animate-fade-up md:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            {me && (
              <div className="flex min-w-0 items-center gap-3">
                <Avatar src={me.avatar_url || undefined} name={me.full_name} className="h-9 w-9 shrink-0 text-xs" />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{me.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {me.is_premium ? t("common.premium") : t("common.freePlan")} ·{" "}
                    {me.points.toLocaleString()} {t("dashboard.pts")}
                  </p>
                </div>
              </div>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-muted-foreground"
              aria-label={t("common.close")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <ul className="space-y-1">
            {/* Everything in the nav that the four-slot bottom bar cannot
                hold. Derived rather than hardcoded, so a new nav item is
                reachable on a phone without editing this file. */}
            {secondary.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className={({ isActive }) => sheetItemClass(isActive)}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {NAV_KEY[to] ? t(NAV_KEY[to]) : label}
                </NavLink>
              </li>
            ))}
            {isStaff &&
              staffNavItems.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} className={({ isActive }) => sheetItemClass(isActive)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {NAV_KEY[to] ? t(NAV_KEY[to]) : label}
                  </NavLink>
                </li>
              ))}
            {!me?.is_premium && (
              <li className="px-1 py-2">
                <PremiumButton className="w-full" />
              </li>
            )}
            <li>
              <NavLink to="/settings" className={({ isActive }) => sheetItemClass(isActive)}>
                <Settings className="h-5 w-5" aria-hidden="true" />
                {t("nav.settings")}
              </NavLink>
            </li>
            <li>
              <button
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </li>
          </ul>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 shadow-medium backdrop-blur-lg md:hidden"
        aria-label={t("common.mainNav")}
      >
        <ul className="flex items-stretch justify-around">
          {primary.map(({ label, to, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {NAV_KEY[to] ? t(NAV_KEY[to]) : label}
              </NavLink>
            </li>
          ))}
          <li className="flex-1">
            <button
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              className={cn(
                "flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                open ? "text-primary" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
              {t("common.more")}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
