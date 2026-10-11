import { NavLink } from "react-router-dom";
import { Scan, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/imaging", label: "Workbench", icon: Scan, end: true },
  { to: "/imaging/cases", label: "Case references", icon: BookOpen, end: false },
];

/** Shared switcher so the two halves of Imaging feel like one section. */
export function ImagingTabs() {
  return (
    <div className="mb-6 inline-flex rounded-xl border border-border bg-card p-1">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </div>
  );
}
