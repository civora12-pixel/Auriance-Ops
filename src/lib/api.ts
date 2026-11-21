import {
  keepPreviousData,
  useQueryClient,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";
import { useCallback } from "react";
import type { AppRouter } from "../../server/rpc/router.ts";
import type { Procedure } from "../../server/rpc/procedure.ts";
import type { Clean, ErrorCode, ErrorData } from "@shared/types.ts";
import i18n, { currentLanguage } from "@/lib/i18n.ts";

/** An error returned by the server, with a message that is safe to show. */
export class ApiError extends Error {
  readonly data: ErrorData;
  readonly status: number;
  constructor(data: ErrorData, status: number) {
    super(data.message);
    this.data = data;
    this.status = status;
  }
  get code(): ErrorCode {
    return this.data.code;
  }
}

/** A readable message for any error, for toasts and inline alerts. */
export function getErrorMessage(
  error: unknown,
  fallback = i18n.t("Something went wrong. Try again."),
): string {
  if (error instanceof ApiError) return error.message || fallback;
  if (error instanceof TypeError)
    return i18n.t(
      "Can't reach the server. Check your connection and try again.",
    );
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function isApiError(
  error: unknown,
  code?: ErrorCode,
): error is ApiError {
  return (
    error instanceof ApiError && (code === undefined || error.code === code)
  );
}

// ---- Typed references: api.orders.get is a reference to the "orders.get" procedure ----

// `__kind` and `__types` exist only in the types (the proxy below returns the path and nothing else)
export type QueryRef<I, O> = {
  readonly __path: string;
  readonly __kind: "query";
  readonly __types?: [I, O];
};
export type MutationRef<I, O> = {
  readonly __path: string;
  readonly __kind: "mutation";
  readonly __types?: [I, O];
};

type Refs<R> = {
  [K in keyof R]: R[K] extends Procedure<infer I, infer O, infer Kind>
    ? Kind extends "query"
      ? QueryRef<I, Clean<O>>
      : MutationRef<I, Clean<O>>
    : Refs<R[K]>;
};

function ref(path: string): unknown {
  return new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === "__path") return path;
        if (typeof key !== "string") return undefined;
        return ref(path ? `${path}.${key}` : key);
      },
    },
  );
}

export const api = ref("") as Refs<AppRouter>;

/** Return type of a query or mutation reference. */
export type Output<T> = T extends { readonly __types?: [unknown, infer O] }
  ? O
  : never;
export type Input<T> = T extends { readonly __types?: [infer I, unknown] }
  ? I
  : never;

// ---- Transport ----

export async function request<T>(
  method: "GET" | "POST" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    // The server answers errors, notifications and history in this language
    headers:
      body === undefined
        ? { "Accept-Language": currentLanguage() }
        : {
            "Content-Type": "application/json",
            "Accept-Language": currentLanguage(),
          },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (a proxy error page, for example)
  }
  if (!res.ok) {
    const err = data as Partial<ErrorData> | null;
    if (err?.code && err.message)
      throw new ApiError(err as ErrorData, res.status);
    throw new ApiError(
      {
        code: res.status >= 500 ? "INTERNAL" : "BAD_REQUEST",
        message: i18n.t("The server responded with {{status}}. Try again.", {
          status: res.status,
        }),
      },
      res.status,
    );
  }
  return data as T;
}

export function callProcedure<T>(path: string, input: unknown): Promise<T> {
  return request<T>("POST", `/api/rpc/${path}`, input ?? {});
}

/** Listeners told when a call comes back unauthenticated (the auth provider signs the user out). */
const unauthenticatedListeners = new Set<() => void>();
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}
export function notifyUnauthenticated(): void {
  for (const listener of unauthenticatedListeners) listener();
}

async function call<T>(path: string, input: unknown): Promise<T> {
  try {
    return await callProcedure<T>(path, input);
  } catch (e) {
    if (isApiError(e, "UNAUTHENTICATED")) notifyUnauthenticated();
    throw e;
  }
}

// ---- Hooks ----

type QueryOptions = {
  /** Keep showing the previous result while new arguments load (lists, filters, pages). */
  keepPrevious?: boolean;
  /** Poll interval in ms (default 30s); false to turn polling off. */
  refetchInterval?: number | false;
};

/**
 * Reads a query. Returns `undefined` while loading, then the result, and keeps it
 * fresh by refetching on window focus, on an interval and after any mutation.
 * Pass "skip" to not run it. Errors other than "signed out" go to the nearest error boundary.
 */
export function useQuery<I, O>(
  ref: QueryRef<I, O>,
  ...args: undefined extends I
    ? [input?: I | "skip", options?: QueryOptions]
    : [input: I | "skip", options?: QueryOptions]
): O | undefined {
  const [input, options] = args;
  const skip = input === "skip";
  const result = useTanstackQuery({
    queryKey: [ref.__path, skip ? null : (input ?? {})],
    queryFn: () => call<O>(ref.__path, input ?? {}),
    enabled: !skip,
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
    refetchInterval: options?.refetchInterval ?? 30_000,
    throwOnError: (error) => !isApiError(error, "UNAUTHENTICATED"),
  });
  return skip ? undefined : result.data;
}

/**
 * Returns a function that runs the mutation and resolves with its result.
 * Every query is refreshed after a successful change.
 */
export function useMutation<I, O>(
  ref: MutationRef<I, O>,
): undefined extends I ? (input?: I) => Promise<O> : (input: I) => Promise<O> {
  const queryClient = useQueryClient();
  const path = ref.__path;
  const run = useCallback(
    async (input?: I) => {
      const result = await call<O>(path, input ?? {});
      void queryClient.invalidateQueries();
      return result;
    },
    [path, queryClient],
  );
  return run as undefined extends I
    ? (input?: I) => Promise<O>
    : (input: I) => Promise<O>;
}

/** Imperative reads (exports, one-off lookups), sharing the query cache. */
export function useApiClient() {
  const queryClient = useQueryClient();
  return {
    query: <I, O>(ref: QueryRef<I, O>, input: I): Promise<O> =>
      queryClient.fetchQuery({
        queryKey: [ref.__path, input ?? {}],
        queryFn: () => call<O>(ref.__path, input ?? {}),
        staleTime: 0,
      }),
  };
}
