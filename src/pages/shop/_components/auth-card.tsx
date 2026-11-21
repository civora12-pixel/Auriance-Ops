import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Crawler } from "./crawler.tsx";

/** A centered card for the shop's sign-in pages. */
export function AuthCard({
  title,
  description,
  children,
  error,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="mx-auto grid w-full max-w-md gap-5 rounded-3xl border border-border bg-card p-5 sm:p-7">
      <div className="grid justify-items-center gap-2 text-center">
        <Crawler kind="baby" state="idle" className="h-14 w-[4.5rem]" />
        <h1 className="font-display text-2xl font-bold text-shop-deep sm:text-3xl">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {children}
    </div>
  );
}

/** Larger touch-friendly inputs for the shop forms. */
export const SHOP_INPUT = "h-12 rounded-xl bg-background text-base";
export const SHOP_BUTTON = "h-12 rounded-full text-base";
