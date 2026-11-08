import type { NextConfig } from "next";

// No `output: "export"`: the API routes need a running server.
// No `trailingSlash`: it would redirect every /api/... call.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
