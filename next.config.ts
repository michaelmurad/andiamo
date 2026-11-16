import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Prompts are read from disk at runtime, not imported, so every server bundle that plans must include them.
  outputFileTracingIncludes: {
    "/api/plan": ["./prompts/**/*.yaml"],
    "/api/edit": ["./prompts/**/*.yaml"],
    "/trip": ["./prompts/**/*.yaml"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
