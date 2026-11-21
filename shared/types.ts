// Type helpers shared by the server and the browser.

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ErrorData = { code: ErrorCode; message: string };

/**
 * What a server value looks like after it crosses the wire: object fields that
 * may be null are omitted (become optional/undefined), exactly like Convex docs.
 */
export type Clean<T> = T extends string | number | boolean | null | undefined
  ? T
  : T extends readonly (infer U)[]
    ? Clean<U>[]
    : T extends object
      ? Flatten<
          { [K in keyof T as null extends T[K] ? never : K]: Clean<T[K]> } & {
            [K in keyof T as null extends T[K] ? K : never]?: Clean<Exclude<T[K], null>>;
          }
        >
      : T;

type Flatten<T> = { [K in keyof T]: T[K] } & {};
