import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    maximumRedirects: 0,
    dangerouslyAllowLocalIP: false,
    maximumResponseBody: 5_000_000,
    maximumDiskCacheSize: 100_000_000,
    remotePatterns: [
      { protocol: "https", hostname: "static.my.ge", port: "", pathname: "/myauto/photos/**" },
      { protocol: "https", hostname: "static.myauto.ge", port: "", pathname: "/**" },
    ],
  },
};

export default withNextIntl(nextConfig);
