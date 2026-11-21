import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, callProcedure, getErrorMessage, isApiError, onUnauthenticated, notifyUnauthenticated } from "./api.ts";

function mockFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api references", () => {
  it("builds procedure paths", () => {
    expect(api.orders.list.__path).toBe("orders.list");
    expect(api.finance.journal.create.__path).toBe("finance.journal.create");
  });
});

describe("callProcedure", () => {
  it("posts the input as JSON and returns the result", async () => {
    const fetchMock = mockFetch(200, JSON.stringify({ items: [], total: 0 }));
    await expect(callProcedure("orders.list", { page: 1 })).resolves.toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/rpc/orders.list",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ page: 1 }) }),
    );
  });

  it("turns server errors into ApiError with the server message", async () => {
    mockFetch(400, JSON.stringify({ code: "BAD_REQUEST", message: "Quantity must be a whole number" }));
    const error = await callProcedure("orders.create", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(isApiError(error, "BAD_REQUEST")).toBe(true);
    expect(getErrorMessage(error)).toBe("Quantity must be a whole number");
  });

  it("explains responses that aren't from the app (proxy pages)", async () => {
    mockFetch(502, "<html>Bad gateway</html>");
    const error = await callProcedure("orders.list", {}).catch((e: unknown) => e);
    expect(isApiError(error, "INTERNAL")).toBe(true);
    expect(getErrorMessage(error)).toMatch(/502/);
  });
});

describe("getErrorMessage", () => {
  it("explains network failures", () => {
    expect(getErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Can't reach the server/);
  });

  it("falls back for unknown values", () => {
    expect(getErrorMessage("nope")).toBe("Something went wrong. Try again.");
    expect(getErrorMessage(null, "Couldn't save")).toBe("Couldn't save");
  });
});

describe("onUnauthenticated", () => {
  it("notifies listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const off = onUnauthenticated(listener);
    notifyUnauthenticated();
    off();
    notifyUnauthenticated();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
