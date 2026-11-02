
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/vault",
  allowedDevOrigins: ["10.0.0.101", "10.0.0.0/24"],
};

export default nextConfig;
