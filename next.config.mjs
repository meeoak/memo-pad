/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  ...(isGitHubPages && {
    basePath: "/memo-pad",
    assetPrefix: "/memo-pad/",
  }),
};

export default nextConfig;
