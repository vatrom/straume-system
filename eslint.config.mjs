import { defineConfig, globalIgnores } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  globalIgnores([
    "**/.next/**",
    "**/node_modules/**",
    "packages/db/prisma/migrations/**",
    ".data/**",
    "apps/mobile/.expo/**",
    "coverage/**",
  ]),
  {
    settings: {
      next: { rootDir: ["apps/web"] },
    },
  },
  ...next,
]);
