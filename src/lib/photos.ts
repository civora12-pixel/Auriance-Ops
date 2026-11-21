import i18n, { currentLanguage } from "@/lib/i18n.ts";
import { ApiError } from "@/lib/api.ts";
import type { ErrorData } from "@shared/types.ts";

/** Uploads a photo (resized on the server) and returns the path to store on a product or variant. */
export async function uploadPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/photos", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Accept-Language": currentLanguage() },
    body: form,
  });
  let data: unknown = null;
  try {
    data = await res.json();
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
  return (data as { url: string }).url;
}

/** "TEE-RED.jpg" → "TEE-RED": photo files are named after the SKU they belong to. */
export function skuFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim();
}
