#!/usr/bin/env node
/** Compact test-only diagnostics. Never prints credentials or application records. */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const report = { commit: process.env.GITHUB_SHA ?? "local", checks: [], failures: [] };
for (const [name, args] of [
  ["typecheck", ["run", "typecheck"]],
  ["unit", ["exec", "--", "vitest", "run", "--reporter=json", "--outputFile=vitest-diagnostics.json"]],
  ["domain", ["exec", "--", "node", "scripts/domain-tests.mjs"]],
]) {
  const result = spawnSync("npm", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  report.checks.push({ name, code: result.status, error: result.error?.message });
  if (name === "unit") {
    try {
      const data = JSON.parse(readFileSync("vitest-diagnostics.json", "utf8"));
      report.tests = { total: data.numTotalTests, passed: data.numPassedTests, failed: data.numFailedTests, pending: data.numPendingTests };
      for (const suite of data.testResults ?? []) {
        const failed = (suite.assertionResults ?? []).filter((test) => test.status === "failed");
        if (suite.status === "failed" && !failed.length) report.failures.push({ file: suite.name.replace(process.cwd() + "/", ""), message: String(suite.message ?? "Suite failed").slice(0, 1200) });
        for (const test of failed) report.failures.push({ file: suite.name.replace(process.cwd() + "/", ""), test: test.fullName, message: (test.failureMessages ?? []).join("\n").replace(/\u001b\[[0-9;]*m/g, "").slice(0, 1200) });
      }
    } catch {
      report.failures.push({ check: name, output: (result.stdout + result.stderr).slice(-2500) });
    }
  } else if (result.status !== 0) report.failures.push({ check: name, output: (result.stdout + result.stderr).slice(-7000) });
}
writeFileSync("stabilization-test-results.json", JSON.stringify(report, null, 2));
console.log("STABILIZATION_TEST_RESULTS\n" + JSON.stringify(report, null, 2));
if (report.checks.some((check) => check.code !== 0)) process.exitCode = 1;
