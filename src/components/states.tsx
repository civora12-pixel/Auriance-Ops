import type { ReactNode } from "react";
import {
  Link,
  isRouteErrorResponse,
  useLocation,
  useNavigate,
  useRouteError,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FileQuestion, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { getErrorMessage, isApiError } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";

/** "This thing doesn't exist (any more)" with a way back. */
export function NotFoundState({
  title,
  description,
  backTo = "/",
  backLabel,
}: {
  title?: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion />
        </EmptyMedia>
        <EmptyTitle role="heading" aria-level={1}>
          {title ?? t("Not found")}
        </EmptyTitle>
        <EmptyDescription>
          {description ?? t("It may have been deleted, or the link is wrong.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild size="sm">
          <Link to={backTo}>{backLabel ?? t("Go to dashboard")}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

/** Contextual empty list, with an optional action (e.g. clear filters or create the first item). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function NoAccessState({ description }: { description?: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={<Lock />}
      title={t("No access")}
      description={
        description ??
        t("You don't have access to this page. Ask an admin if you need it.")
      }
      action={
        <Button asChild size="sm" variant="outline">
          <Link to="/">{t("Go home")}</Link>
        </Button>
      }
    />
  );
}

/** Skeleton shaped like a page: header, a row of cards and a table. */
export function PageSkeleton({
  cards = 0,
  rows = 6,
}: {
  cards?: number;
  rows?: number;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6 lg:p-8"
      aria-busy="true"
      aria-label={t("Loading")}
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {cards > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}
      <TableSkeleton rows={rows} />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <Skeleton className="h-6 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Route-level error screen (render errors and failed queries), with Retry. */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const notFound =
    (isRouteErrorResponse(error) && error.status === 404) ||
    isApiError(error, "NOT_FOUND");
  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <NotFoundState />
      </div>
    );
  }
  if (isApiError(error, "FORBIDDEN")) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <NoAccessState description={error.message} />
      </div>
    );
  }

  const message = isRouteErrorResponse(error)
    ? error.statusText
    : getErrorMessage(error);
  const retry = () => {
    queryClient.removeQueries({ predicate: (q) => q.state.status === "error" });
    navigate(`${location.pathname}${location.search}`, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <Empty className="border border-destructive/40">
        <EmptyHeader>
          <EmptyMedia
            variant="icon"
            className="bg-destructive/10 text-destructive"
          >
            <AlertTriangle />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>
            {t("Something went wrong")}
          </EmptyTitle>
          <EmptyDescription>{message}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button size="sm" onClick={retry}>
            <RotateCw />
            {t("Retry")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/">{t("Go home")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
