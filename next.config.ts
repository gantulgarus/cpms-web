import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Гүйцэтгэгчийн хуудас `/contractors-v2`-оос `/contractors` руу шилжсэн —
  // хуучин хаягаар хадгалсан bookmark эвдрэхгүй.
  async redirects() {
    return [{ source: "/contractors-v2", destination: "/contractors", permanent: true }];
  },
};

export default nextConfig;
