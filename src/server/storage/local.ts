import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageDriver } from "./index";

/** Stores objects on the local filesystem (development or single-server deployments). */
export class LocalStorage implements StorageDriver {
  private readonly root: string;

  constructor(dir: string) {
    this.root = path.resolve(dir);
  }

  private resolve(key: string) {
    // Keys are generated server-side, but guard against traversal regardless.
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}
