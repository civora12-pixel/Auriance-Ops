import type { ReactNode } from "react";
import { LanguageToggle } from "@/components/language-toggle.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { useAuth } from "@/lib/auth.tsx";

/** Centered card used by the sign-in, setup and invite screens. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const { settings } = useAuth();
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <LanguageToggle className="absolute top-3 end-3" />
      <div className="mb-6 flex flex-col items-center gap-2 text-lg font-semibold">
        <img
          src="/brand/logo.webp"
          alt=""
          className="size-28 rounded-2xl bg-white object-contain shadow-sm"
        />
        {settings.businessName}
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
