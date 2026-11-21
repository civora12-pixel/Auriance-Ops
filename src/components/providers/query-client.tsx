import { QueryClient, QueryClientProvider as ReactQueryClientProvider } from "@tanstack/react-query";
import { isApiError } from "@/lib/api.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
      // Don't retry answers that won't change (bad input, no access, not found)
      retry: (failures, error) =>
        failures < 2 && !isApiError(error, "BAD_REQUEST") && !isApiError(error, "FORBIDDEN") && !isApiError(error, "NOT_FOUND") && !isApiError(error, "UNAUTHENTICATED"),
    },
  },
});

export function QueryClientProvider({ children }: { children: React.ReactNode }) {
  return <ReactQueryClientProvider client={queryClient}>{children}</ReactQueryClientProvider>;
}
