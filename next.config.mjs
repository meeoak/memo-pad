/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const basePath = isGitHubPages ? "/memo-pad/content-desk" : "";

const nextConfig = {
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  ...(isGitHubPages && {
    output: "export",
    basePath,
    assetPrefix: `${basePath}/`,
  }),
};

export default nextConfig;
