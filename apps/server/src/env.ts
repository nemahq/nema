import { homedir } from "node:os";
import { resolve } from "node:path";

import { config } from "dotenv";

export class EnvError extends Error {
  constructor(variable: string) {
    super(`Missing required environment variable: ${variable}`);
    this.name = "EnvError";
  }
}

export function loadEnv(appRoot: string): void {
  config({ path: resolve(appRoot, ".env") });
  config({ path: resolve(homedir(), ".config/nema/server.env") });
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new EnvError(name);
  }
  return value;
}
