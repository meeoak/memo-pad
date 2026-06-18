/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? "/memo-pad/content-desk" : "";

const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  ...(isGitHubPages && {
    basePath,
    assetPrefix: `${basePath}/`,
  }),
};

export default nextConfig;
