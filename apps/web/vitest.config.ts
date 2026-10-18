import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
  },
});
