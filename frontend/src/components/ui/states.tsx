import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** One implementation of loading / empty / error, so every page behaves the same. */

export function LoadingState({ label }: { label?: string }) {
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 py-20 text-muted-foreground" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label ?? t("common.loading")}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <Card className={cn("animate-pulse p-6", className)}>
      <div className="h-3 w-24 rounded-full bg-muted" />
      <div className="mt-4 h-4 w-3/4 rounded-full bg-muted" />
      <div className="mt-2 h-3 w-full rounded-full bg-muted" />
      <div className="mt-2 h-3 w-5/6 rounded-full bg-muted" />
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Card className="border-destructive/30 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div>
          <h3 className="font-display font-bold">{title ?? t("common.somethingWrong")}</h3>
          {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
          {onRetry && (
            <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}>
              {t("common.tryAgain")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
