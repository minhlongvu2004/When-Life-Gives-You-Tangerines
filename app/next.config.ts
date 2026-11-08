import type { NextConfig } from "next";

// This is a normal server build, not a static one, because the API routes need a running server.
// Do not set a trailing slash option: it would redirect every /api call.
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
