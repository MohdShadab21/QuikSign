import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `libreoffice-convert` is a CJS module that spawns soffice; never bundle it.
  // `tmp` is its dep with dynamic requires we want to leave to Node's resolver.
  serverExternalPackages: ["libreoffice-convert", "tmp"],
};

export default nextConfig;
