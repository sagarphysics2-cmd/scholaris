import { env } from "@/lib/env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";

/** Object storage abstraction — swap drivers via STORAGE_DRIVER without touching callers. */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (!driver) {
    const e = env();
    driver =
      e.STORAGE_DRIVER === "s3"
        ? new S3Storage({
            bucket: e.S3_BUCKET ?? "",
            region: e.S3_REGION,
            endpoint: e.S3_ENDPOINT || undefined,
            accessKeyId: e.S3_ACCESS_KEY_ID ?? "",
            secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? "",
          })
        : new LocalStorage(e.STORAGE_LOCAL_DIR);
  }
  return driver;
}

/** Test hook. */
export function setStorageDriver(d: StorageDriver) {
  driver = d;
}
