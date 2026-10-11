import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/ui/brand-mark";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useLanguage } from "@/lib/i18n";
import { site } from "@/config/site";

const DEMO_PASSWORD = "medly1234";

const DEMO_ACCOUNTS = [
  { email: "student@medly.dev", noteKey: "auth.demoStudent" },
  { email: "premium@medly.dev", noteKey: "auth.demoPremium" },
  { email: "instructor@medly.dev", noteKey: "auth.demoInstructor" },
];

const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((account) => account.email));

type Mode = "signin" | "register";

/**
 * Sign in and sign up, in one card.
 *
 * Two routes would mean two copies of the same chrome and a full navigation to
 * switch between them; the account you want is a mode, not a destination. The
 * URL still names it (`/login?mode=register`) so the choice survives a reload
 * and can be linked to directly.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { refresh } = useSession();
  const { t } = useLanguage();

  // Set by AppLayout when it bounces an unauthenticated visit.
  const from = (location.state as { from?: string } | null)?.from;

  const [mode, setMode] = useState<Mode>(
    params.get("mode") === "register" ? "register" : "signin"
  );
  const [email, setEmail] = useState("premium@medly.dev");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const registering = mode === "register";

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    // The sign-in form ships pre-filled with a demo account so the judges can
    // get in with one click. Carrying that into the sign-up form would offer
    // to register an address that already exists, so it is cleared on the way.
    if (next === "register" && DEMO_EMAILS.has(email)) {
      setEmail("");
      setPassword("");
    }
    const nextParams = new URLSearchParams(params);
    if (next === "register") nextParams.set("mode", "register");
    else nextParams.delete("mode");
    setParams(nextParams, { replace: true });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server: a round trip to be told the
    // password is too short is a round trip the browser already knew about.
    if (registering && password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setBusy(true);
    try {
      if (registering) {
        await api.register({
          email,
          password,
          full_name: fullName,
          institution: institution.trim() || undefined,
          year_of_study: yearOfStudy ? Number(yearOfStudy) : undefined,
        });
      } else {
        await api.login(email, password);
      }
      // Populate the shared session before navigating, or the first page after
      // sign-in renders with no user and has to fetch it again.
      await refresh();
      navigate(from ?? "/dashboard", { replace: true });
    } catch (err) {
      const fallback = registering ? t("auth.registerFailed") : t("auth.signInFailed");
      setError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center gradient-hero px-4 py-10">
      <Card className="w-full max-w-sm p-7 shadow-medium">
        <div className="flex items-center gap-3">
          <BrandMark className="h-11 w-11" />
          <span className="font-display text-2xl font-bold text-gradient">{site.name}</span>
        </div>

        <h1 className="mt-6 font-display text-xl font-bold">
          {registering ? t("auth.registerTitle") : t("auth.signInTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {registering ? t("auth.registerSubtitle") : t("auth.signInSubtitle")}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          {registering && (
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("auth.fullName")}
              autoComplete="name"
              required
              minLength={2}
            />
          )}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.email")}
            autoComplete={registering ? "email" : "username"}
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            autoComplete={registering ? "new-password" : "current-password"}
            required
            minLength={registering ? 8 : undefined}
          />
          {registering && (
            <>
              <Input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder={t("auth.institution")}
                autoComplete="organization"
              />
              <Input
                type="number"
                min={1}
                max={10}
                value={yearOfStudy}
                onChange={(e) => setYearOfStudy(e.target.value)}
                placeholder={t("auth.yearOfStudy")}
              />
            </>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {registering ? t("auth.registerAction") : t("auth.signInAction")}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {registering ? t("auth.alreadyHaveAccount") : t("auth.newToMedly")}{" "}
          <button
            type="button"
            onClick={() => switchTo(registering ? "signin" : "register")}
            className="font-semibold text-primary hover:underline"
          >
            {registering ? t("auth.goToSignIn") : t("auth.goToRegister")}
          </button>
        </p>

        {!registering && (
          <div className="mt-6 border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground">
              {t("auth.demoAccounts")}
            </p>
            <ul className="mt-2 space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                    }}
                    className="w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">{account.email}</span>
                    <span className="text-muted-foreground"> — {t(account.noteKey)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 px-2 text-xs text-muted-foreground">
              {t("auth.demoPassword", { password: DEMO_PASSWORD })}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
