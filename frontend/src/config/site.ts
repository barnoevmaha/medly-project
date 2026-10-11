/* =============================================================
   BRANDING — edit this file to make the app yours.
   Colours live in src/index.css; everything else is here.
   ============================================================= */

import {
  House, Users, Trophy, BookOpen, User, GraduationCap, ShieldCheck, Scan,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export const site = {
  name: "Medly",
  initial: "M",
  tagline: "The #1 Platform for Medical Students",
  description: "Medly — Medical Learning Platform",
  copyright: "© 2024 Medly. Empowering medical education worldwide.",
};

export type NavItem = { label: string; to: string; icon: LucideIcon };

/**
 * The five destinations every student needs.
 *
 * Learning material reaches students through the Dashboard and the Library
 * rather than through their own nav entries — AI Training and the imaging
 * Workbench are linked from Dashboard, and Saved is a tab inside Library. A
 * ten-item sidebar was a site map, not navigation.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: House },
  { label: "Communities", to: "/community", icon: Users },
  { label: "Challenges", to: "/challenges", icon: Trophy },
  { label: "Virtual Patient", to: "/virtual-patient", icon: Stethoscope },
  { label: "Library", to: "/library", icon: BookOpen },
  { label: "Profile", to: "/profile", icon: User },
];

/**
 * Teaching tools. Added to the sidebar only for instructors and admins — the
 * API enforces the same split, so hiding these is presentation, not the rule.
 */
export const staffNavItems: NavItem[] = [
  { label: "AI Training", to: "/learn", icon: GraduationCap },
  { label: "Case references", to: "/imaging/cases", icon: Scan },
  { label: "Governance", to: "/governance", icon: ShieldCheck },
];

/** The bottom bar holds four; Profile and the rest live behind "More". */
export const MOBILE_PRIMARY = ["/dashboard", "/community", "/challenges", "/library"];
