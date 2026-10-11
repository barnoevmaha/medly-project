import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Check, Eye, Globe, KeyRound, Loader2, LogOut, Monitor, Moon,
  Palette, Sun, Trash2, User as UserIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/layout/PageHeader";
import { useToast } from "@/components/ui/toast";
import { LoadingState } from "@/components/ui/states";
import { useSession } from "@/lib/session";
import { LANGUAGES, translateFor, useLanguage, type Lang } from "@/lib/i18n";
import {
  readPreferences,
  writePreferences,
  type Preferences,
  type Theme,
} from "@/lib/preferences";
import { api } from "@/lib/api";
import {
  AVATAR_MIME_TYPES,
  ImageError,
  resizeImageToDataUrl,
  type ImageProblem,
} from "@/lib/image";
import { cn } from "@/lib/utils";

/** Which message a rejected file earns. */
const IMAGE_PROBLEM_KEY: Record<ImageProblem, string> = {
  type: "settings.avatarInvalidType",
  size: "settings.avatarTooLarge",
  decode: "settings.avatarUnreadable",
  encode: "settings.avatarUnreadable",
};

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "gradient-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

type SectionKey = "account" | "security" | "privacy" | "appearance" | "language" | "session";

/**
 * Settings.
 *
 * Left column lists the categories, right column is the detail panel for
 * whichever one is selected — same structural pattern as a typical settings
 * app, kept in Medly's teal/white theme rather than a dark sidebar. There is
 * no Notifications section: Medly does not send email or push notifications,
 * so a page of toggles for messages that never arrive would not be honest.
 */
export default function Settings() {
  const toast = useToast();
  const { me, refresh, logout } = useSession();
  const { t, lang, setLang } = useLanguage();

  const SECTIONS: Array<{ key: SectionKey; label: string; icon: typeof UserIcon }> = [
    { key: "account", label: t("settings.account"), icon: UserIcon },
    { key: "security", label: t("settings.security"), icon: KeyRound },
    { key: "privacy", label: t("settings.privacy"), icon: Eye },
    { key: "appearance", label: t("settings.appearance"), icon: Palette },
    { key: "language", label: t("settings.language"), icon: Globe },
    { key: "session", label: t("settings.session"), icon: LogOut },
  ];

  const [active, setActive] = useState<SectionKey>("account");
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [account, setAccount] = useState({ full_name: "", institution: "", year_of_study: "" });
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [busyPrivacy, setBusyPrivacy] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  /* Shown instead of `me.avatar_url` while the request is in flight, so the
     new picture appears the moment it is chosen. Cleared on success (the
     session now holds it) and on failure (it was never real). */
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    setAccount({
      full_name: me.full_name,
      institution: me.institution ?? "",
      year_of_study: me.year_of_study ? String(me.year_of_study) : "",
    });
  }, [me]);

  function updatePreference(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    writePreferences(next);
  }

  async function saveAccount(event: React.FormEvent) {
    event.preventDefault();
    setSavingAccount(true);
    try {
      await api.updateMe({
        full_name: account.full_name,
        institution: account.institution,
        year_of_study: account.year_of_study ? Number(account.year_of_study) : undefined,
      });
      await refresh();
      toast(t("settings.accountSaved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.accountSaveError"), "error");
    } finally {
      setSavingAccount(false);
    }
  }

  async function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately, or picking the same file twice fires no change event.
    event.target.value = "";
    if (!file) return;

    let dataUrl: string;
    try {
      // Type, size and the resize all happen before any network call: being
      // told by the server that a 9 MB HEIC is not a PNG is a slow way to
      // learn something the browser already knew.
      dataUrl = await resizeImageToDataUrl(file);
    } catch (e) {
      toast(
        t(e instanceof ImageError ? IMAGE_PROBLEM_KEY[e.problem] : "settings.avatarUnreadable"),
        "error"
      );
      return;
    }

    setAvatarPreview(dataUrl);
    setSavingAvatar(true);
    try {
      await api.updateMe({ avatar_url: dataUrl });
      // Every avatar in the app reads `me.avatar_url` through the session, so
      // one refresh updates the sidebar, the mobile sheet and the profile
      // page at once — no reload, no per-component wiring.
      await refresh();
      toast(t("settings.avatarUpdated"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.avatarUpdateError"), "error");
    } finally {
      // Either the session now has it, or it was rejected. Both mean the
      // optimistic copy has served its purpose.
      setAvatarPreview(null);
      setSavingAvatar(false);
    }
  }

  async function removeAvatar() {
    setSavingAvatar(true);
    try {
      await api.updateMe({ avatar_url: "" });
      await refresh();
      toast(t("settings.avatarRemoved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.avatarUpdateError"), "error");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function savePassword(event: React.FormEvent) {
    event.preventDefault();
    if (passwords.next !== passwords.confirm) {
      toast(t("settings.passwordMismatch"), "error");
      return;
    }
    setSavingPassword(true);
    try {
      await api.changePassword(passwords.current, passwords.next);
      setPasswords({ current: "", next: "", confirm: "" });
      toast(t("settings.passwordChanged"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.passwordChangeError"), "error");
    } finally {
      setSavingPassword(false);
    }
  }

  async function setLeaderboardVisibility(value: boolean) {
    setBusyPrivacy(true);
    try {
      await api.updateMe({ show_on_leaderboard: value });
      await refresh();
      toast(value ? t("settings.leaderboardShown") : t("settings.leaderboardHidden"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.privacyUpdateError"), "error");
    } finally {
      setBusyPrivacy(false);
    }
  }

  async function clearAssistantHistory() {
    setClearing(true);
    try {
      await api.clearAssistantHistory();
      toast(t("settings.historyDeleted"));
    } catch (e) {
      toast(e instanceof Error ? e.message : t("settings.historyDeleteError"), "error");
    } finally {
      setClearing(false);
    }
  }

  function changeLanguage(next: Lang) {
    setLang(next);
    // `t` still reflects the outgoing language until this component
    // re-renders, so the confirmation toast is resolved directly against
    // the language just chosen instead.
    toast(translateFor(next, "settings.languageUpdated"));
  }

  if (!me) return <LoadingState label={t("settings.loading")} />;

  const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: "light", label: t("settings.light"), icon: Sun },
    { value: "dark", label: t("settings.dark"), icon: Moon },
    { value: "system", label: t("settings.system"), icon: Monitor },
  ];

  const activeSection = SECTIONS.find((s) => s.key === active)!;

  let panelTitle = activeSection.label;
  let panelDescription = "";
  let panelBody: ReactNode = null;

  if (active === "account") {
    panelDescription = t("settings.accountDesc");
    panelBody = (
      <form onSubmit={saveAccount} className="space-y-3">
        {/* ---------------- profile picture ---------------- */}
        <div className="flex items-center gap-4 pb-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={savingAvatar}
            aria-label={t("settings.changePhoto")}
            className="group relative shrink-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
          >
            <Avatar
              src={avatarPreview || me.avatar_url || undefined}
              name={me.full_name}
              className="h-20 w-20 text-xl"
            />
            {/* Hover reveals the affordance on a pointer; the button beside it
                is what a touch or keyboard user aims at. */}
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-2xl bg-black/45 text-primary-foreground transition-opacity",
                savingAvatar ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              )}
              aria-hidden="true"
            >
              {savingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
            </span>
          </button>

          <div className="min-w-0">
            <div className="text-sm font-medium">{t("settings.profilePicture")}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("settings.profilePictureHint")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={savingAvatar}
                onClick={() => fileInput.current?.click()}
              >
                {savingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                {t("settings.changePhoto")}
              </Button>
              {me.avatar_url && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={savingAvatar}
                  onClick={() => void removeAvatar()}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("settings.removePhoto")}
                </Button>
              )}
            </div>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept={AVATAR_MIME_TYPES.join(",")}
            className="hidden"
            onChange={(event) => void chooseAvatar(event)}
          />
        </div>

        <label className="block">
          <span className="text-sm font-medium">{t("settings.fullName")}</span>
          <Input
            className="mt-1.5"
            value={account.full_name}
            onChange={(event) => setAccount({ ...account, full_name: event.target.value })}
            required
            minLength={2}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("settings.institution")}</span>
          <Input
            className="mt-1.5"
            value={account.institution}
            onChange={(event) => setAccount({ ...account, institution: event.target.value })}
            placeholder={t("settings.institutionPlaceholder")}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("settings.yearOfStudy")}</span>
          <Input
            className="mt-1.5"
            type="number"
            min={1}
            max={10}
            value={account.year_of_study}
            onChange={(event) => setAccount({ ...account, year_of_study: event.target.value })}
            placeholder={t("settings.yearPlaceholder")}
          />
        </label>

        <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("settings.email")}</span>
            <span className="font-medium">{me.email}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("settings.role")}</span>
            <Badge variant="info">{me.role}</Badge>
            {me.is_premium && <Badge variant="accent">{t("common.premium")}</Badge>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("settings.uneditableHint")}</p>
        </div>

        <Button type="submit" disabled={savingAccount}>
          {savingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("settings.saveChanges")}
        </Button>
      </form>
    );
  } else if (active === "security") {
    panelDescription = t("settings.securityDesc");
    panelBody = (
      <form onSubmit={savePassword} className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">{t("settings.currentPassword")}</span>
          <Input
            className="mt-1.5"
            type="password"
            autoComplete="current-password"
            value={passwords.current}
            onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("settings.newPassword")}</span>
          <Input
            className="mt-1.5"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={passwords.next}
            onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{t("settings.confirmPassword")}</span>
          <Input
            className="mt-1.5"
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={passwords.confirm}
            onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })}
            required
          />
        </label>
        <p className="text-xs text-muted-foreground">{t("settings.passwordHint")}</p>
        <Button type="submit" disabled={savingPassword}>
          {savingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("settings.changePassword")}
        </Button>
      </form>
    );
  } else if (active === "privacy") {
    panelDescription = t("settings.privacyDesc");
    panelBody = (
      <div className="divide-y divide-border">
        <Toggle
          label={t("settings.showOnLeaderboard")}
          hint={t("settings.showOnLeaderboardHint")}
          checked={me.show_on_leaderboard}
          disabled={busyPrivacy}
          onChange={(value) => void setLeaderboardVisibility(value)}
        />
        <div className="py-3">
          <div className="text-sm font-medium">{t("settings.assistantHistory")}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("settings.assistantHistoryHint")}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            onClick={() => void clearAssistantHistory()}
            disabled={clearing}
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("settings.deleteHistory")}
          </Button>
        </div>
        <div className="py-3">
          <div className="text-sm font-medium">{t("settings.patientData")}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("settings.patientDataHint")}{" "}
            <Link to="/governance" className="text-primary hover:underline">
              {t("settings.seeStandard")}
            </Link>
            .
          </p>
        </div>
      </div>
    );
  } else if (active === "appearance") {
    panelDescription = t("settings.appearanceDesc");
    panelBody = (
      <>
        <div className="text-sm font-medium">{t("settings.theme")}</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => updatePreference({ theme: value })}
              aria-pressed={preferences.theme === value}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors",
                preferences.theme === value
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border hover:bg-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 divide-y divide-border border-t border-border">
          <Toggle
            label={t("settings.reduceMotion")}
            hint={t("settings.reduceMotionHint")}
            checked={preferences.reduceMotion}
            onChange={(value) => updatePreference({ reduceMotion: value })}
          />
        </div>
      </>
    );
  } else if (active === "language") {
    panelDescription = t("settings.languageDesc");
    panelBody = (
      <div className="grid gap-3 sm:grid-cols-3">
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => changeLanguage(option.code)}
            aria-pressed={lang === option.code}
            className={cn(
              "flex items-center justify-between gap-2 rounded-xl border p-4 text-left transition-colors",
              lang === option.code
                ? "border-primary/50 bg-primary/10"
                : "border-border hover:bg-muted"
            )}
          >
            <div>
              <div className="font-semibold">{option.label}</div>
              <div className="text-xs text-muted-foreground">{option.english}</div>
            </div>
            {lang === option.code && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    );
  } else if (active === "session") {
    panelDescription = t("settings.sessionDesc");
    panelBody = (
      <>
        <p className="text-sm text-muted-foreground">{t("settings.signOutHint")}</p>
        <Button className="mt-4" variant="outline" onClick={logout}>
          <LogOut className="h-4 w-4" />
          {t("settings.logOut")}
        </Button>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* ---------------- category list ---------------- */}
        <nav
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          aria-label={t("settings.sectionsAria")}
        >
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              aria-current={active === key}
              className={cn(
                "flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors lg:shrink lg:w-full",
                active === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>

        {/* ---------------- detail panel ---------------- */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold">{panelTitle}</h2>
          {panelDescription && (
            <p className="mt-0.5 text-sm text-muted-foreground">{panelDescription}</p>
          )}
          <div className="mt-5">{panelBody}</div>
        </Card>
      </div>
    </>
  );
}
