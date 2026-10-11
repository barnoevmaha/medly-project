import { NavLink } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { navItems, site, staffNavItems, type NavItem } from "@/config/site";
import { BrandMark } from "@/components/ui/brand-mark";
import { PremiumButton } from "@/components/ui/premium-button";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Nav labels are authored in English in config/site.ts; this maps each
 *  route to its translation key so the sidebar renders in the active language. */
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

function itemClass(isActive: boolean) {
  return cn(
    "relative flex items-center gap-3 rounded-xl px-4 py-2.5 transition-colors duration-200",
    isActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  );
}

function Item({ label, to, icon: Icon }: NavItem) {
  const { t } = useLanguage();
  return (
    <li>
      <NavLink to={to} className={({ isActive }) => itemClass(isActive)}>
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute left-0 h-7 w-1 rounded-full bg-primary" aria-hidden="true" />
            )}
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="font-medium">{NAV_KEY[to] ? t(NAV_KEY[to]) : label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}

export function Sidebar() {
  const { me, logout } = useSession();
  const { t } = useLanguage();
  const isStaff = me?.role === "instructor" || me?.role === "admin";

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-border bg-card md:flex">
      <NavLink to="/dashboard" className="flex items-center gap-3 px-6 py-6">
        <BrandMark className="h-10 w-10" />
        <span className="font-display text-2xl font-bold text-gradient">{site.name}</span>
      </NavLink>

      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label={t("common.mainNav")}>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <Item key={item.to} {...item} />
          ))}
        </ul>

        {/* Teaching tools, for accounts that have them. */}
        {isStaff && (
          <>
            <p className="mt-6 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Teaching
            </p>
            <ul className="mt-2 space-y-1">
              {staffNavItems.map((item) => (
                <Item key={item.to} {...item} />
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Go Premium, then Settings, then Log out — same shape, Premium stands out by color. */}
      <div className="space-y-1 border-t border-border p-3">
        {!me?.is_premium && <PremiumButton className="w-full" />}

        <NavLink to="/settings" className={({ isActive }) => itemClass(isActive)}>
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className="font-medium">{t("nav.settings")}</span>
        </NavLink>

        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          <span className="font-medium">{t("nav.logout")}</span>
        </button>
      </div>
    </aside>
  );
}
