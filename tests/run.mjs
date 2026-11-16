import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".test-dist");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");

fs.rmSync(outDir, { recursive: true, force: true });

try {
  const compile = spawnSync(process.execPath, [tscBin, "-p", "tsconfig.test.json"], {
    cwd: root,
    stdio: "inherit",
  });
  if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
  }

  const testDir = path.join(outDir, "tests");
  const testFiles = fs
    .readdirSync(testDir)
    .filter((f) => f.endsWith(".test.js"))
    .sort()
    .map((f) => path.join(testDir, f));

  if (testFiles.length === 0) {
    console.error("No compiled test files found in", testDir);
    process.exit(1);
  }

  const res = spawnSync(
    process.execPath,
    ["-r", path.join(root, "tests", "register.cjs"), "--test", ...testFiles],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  process.exitCode = res.status ?? 1;
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
