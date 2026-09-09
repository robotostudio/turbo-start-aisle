import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // SonarQube Cloud reads the lcov (see sonar-project.properties) and
      // resolves its paths against the repo root, but Vitest runs from
      // apps/web, so without projectRoot every SF: line points at a file that
      // does not exist from there and the whole report counts as zero.
      reporter: [
        "text",
        [
          "lcovonly",
          { projectRoot: fileURLToPath(new URL("../..", import.meta.url)) },
        ],
      ],
      // Without an explicit include, v8 only reports files a test imported,
      // so untested modules would silently count as full coverage.
      include: ["src/**/*.{ts,tsx}"],
    },
  },
  // Components under test are .tsx, and the web tsconfig sets `jsx: preserve`
  // for Next. Vite 8 (which Vitest now runs on) honours that and hands the JSX
  // through untransformed, which is not valid JS. `oxc` replaces the `esbuild`
  // option that carried this before; the two are not aliases, and the
  // deprecated one is ignored.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
