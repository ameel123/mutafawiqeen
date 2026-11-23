import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { TEST_DB } from "../playwright.config";

export default function globalSetup() {
  // Fresh schema + curriculum seeds on every run.
  execFileSync("node", ["scripts/db-setup.mjs", "--reset"], {
    env: { ...process.env, DATABASE_URL: TEST_DB },
    stdio: "inherit",
  });
  rmSync(".data/e2e-storage", { recursive: true, force: true });
}
