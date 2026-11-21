import { AuthProvider } from "@/lib/auth.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { LanguageProvider, useLanguage } from "./language.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";

/** Toasts appear in the top corner on the end side (top-left in Arabic). */
function AppToaster() {
  const { dir } = useLanguage();
  return (
    <Toaster
      richColors
      closeButton
      position={dir === "rtl" ? "top-left" : "top-right"}
    />
  );
}

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <TooltipProvider delayDuration={300}>
              <AppToaster />
              {children}
            </TooltipProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
