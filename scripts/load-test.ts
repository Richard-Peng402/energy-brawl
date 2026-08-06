import { pathToFileURL } from "node:url";

import { runLoadTest, validateLoadTestReport } from "./v3-load-test";

export async function main(): Promise<void> {
  const report = await runLoadTest({ reportPath: process.env.LOAD_TEST_REPORT?.trim() || undefined });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const errors = validateLoadTestReport(report);
  if (errors.length > 0) {
    process.stderr.write(`${errors.join("; ")}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
