import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      // Logic: plain functions, in Node.
      { resolve: { alias }, test: { name: "unit", include: ["src/**/*.test.ts", "evals/**/*.test.ts"] } },
      // Client components, rendered into jsdom. Async Server Components can't render here; e2e/ covers those.
      {
        plugins: [react()],
        resolve: { alias },
        test: { name: "dom", include: ["src/**/*.test.tsx"], environment: "jsdom", setupFiles: ["./vitest.setup.ts"] },
      },
    ],
  },
});
