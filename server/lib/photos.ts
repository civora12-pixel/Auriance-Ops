// Product photos. In production they live in a Railway Storage Bucket (private,
// S3-compatible); viewers are redirected to a short-lived signed link, which
// Railway serves for free. Without bucket settings (dev, tests) photos are kept
// in a folder next to the database instead.
//
// Photos are addressed by the app path /api/photos/<key>, which is what the
// product and variant records store, so the storage can change without
// touching the catalog.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import sharp from "sharp";
import { AppError } from "../rpc/procedure.ts";

/** Upload limit before resizing (phone and marketing photos are often several MB). */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
/** Longest side after resizing: sharp enough to enlarge on a screen, small to load. */
const PHOTO_MAX_SIDE = 1600;
/** Signed links stay valid for an hour; browsers cache the redirect for less than that. */
const SIGNED_URL_SECONDS = 3600;
export const PHOTO_PATH_PREFIX = "/api/photos/";
const KEY_RE = /^[a-z0-9]{32}\.webp$/;

export type PhotoStore = {
  /** Saves resized photo bytes and returns the key. */
  put(bytes: Buffer): Promise<string>;
  /** How to answer a request for a photo. */
  serve(key: string): Promise<{ redirect: string } | { file: Buffer } | null>;
  kind: "bucket" | "folder";
};

export type BucketSettings = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Railway's newer buckets use virtual-hosted URLs; older ones path-style. */
  pathStyle?: boolean;
};

function newKey(): string {
  return `${crypto.randomBytes(16).toString("hex")}.webp`;
}

export function isPhotoKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Bucket store: uploads with signed PUTs, serves through signed GET links. */
export function bucketStore(settings: BucketSettings): PhotoStore {
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    region: settings.region || "auto",
    service: "s3",
  });
  const base = new URL(settings.endpoint);
  const objectUrl = (key: string) =>
    settings.pathStyle
      ? `${base.origin}/${settings.bucket}/${key}`
      : `${base.protocol}//${settings.bucket}.${base.host}/${key}`;

  return {
    kind: "bucket",
    async put(bytes) {
      const key = newKey();
      const res = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: new Uint8Array(bytes),
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
      if (!res.ok) {
        throw new AppError(
          "INTERNAL",
          `Couldn't save the photo to storage (${res.status}). Try again.`,
        );
      }
      return key;
    },
    async serve(key) {
      const url = new URL(objectUrl(key));
      url.searchParams.set("X-Amz-Expires", String(SIGNED_URL_SECONDS));
      const signed = await client.sign(url.toString(), {
        method: "GET",
        aws: { signQuery: true },
      });
      return { redirect: signed.url };
    },
  };
}

/** Folder store for development and tests. */
export function folderStore(dir: string): PhotoStore {
  return {
    kind: "folder",
    async put(bytes) {
      fs.mkdirSync(dir, { recursive: true });
      const key = newKey();
      fs.writeFileSync(path.join(dir, key), bytes);
      return key;
    },
    async serve(key) {
      const file = path.join(dir, key);
      return fs.existsSync(file) ? { file: fs.readFileSync(file) } : null;
    },
  };
}

/** Resizes and converts an uploaded image to WebP. Rejects anything that isn't a readable image. */
export async function preparePhoto(input: Buffer): Promise<Buffer> {
  if (input.length > PHOTO_MAX_BYTES) {
    throw new AppError(
      "BAD_REQUEST",
      "The photo is too large. Use one under 15 MB.",
    );
  }
  try {
    return await sharp(input, { failOn: "error" })
      .rotate() // respect the phone's orientation
      .resize({
        width: PHOTO_MAX_SIDE,
        height: PHOTO_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new AppError(
      "BAD_REQUEST",
      "That file isn't a photo the app can read. Use a JPG, PNG or WebP image.",
    );
  }
}

/** Store from the environment: the bucket when it's configured, otherwise a folder. */
export function photoStoreFromEnv(env: {
  BUCKET_ENDPOINT?: string;
  BUCKET_NAME?: string;
  BUCKET_REGION?: string;
  BUCKET_ACCESS_KEY_ID?: string;
  BUCKET_SECRET_ACCESS_KEY?: string;
  BUCKET_PATH_STYLE?: boolean;
  PHOTOS_DIR: string;
}): PhotoStore {
  if (
    env.BUCKET_ENDPOINT &&
    env.BUCKET_NAME &&
    env.BUCKET_ACCESS_KEY_ID &&
    env.BUCKET_SECRET_ACCESS_KEY
  ) {
    return bucketStore({
      endpoint: env.BUCKET_ENDPOINT,
      bucket: env.BUCKET_NAME,
      region: env.BUCKET_REGION ?? "auto",
      accessKeyId: env.BUCKET_ACCESS_KEY_ID,
      secretAccessKey: env.BUCKET_SECRET_ACCESS_KEY,
      pathStyle: env.BUCKET_PATH_STYLE,
    });
  }
  return folderStore(env.PHOTOS_DIR);
}
