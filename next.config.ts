import type { NextConfig } from 'next';

const config: NextConfig = {
  // The extension bundle is built by esbuild, not by Next — keep it out of the page build.
  outputFileTracingExcludes: { '*': ['./extension/**'] },
  eslint: { ignoreDuringBuilds: true },
};

export default config;
