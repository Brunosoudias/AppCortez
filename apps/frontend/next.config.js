/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Permite importar TypeScript "fonte" (não compilado) dos pacotes
  // compartilhados do monorepo diretamente, sem precisar publicá-los.
  transpilePackages: ['@ai-video-cutter/shared-types', '@ai-video-cutter/shared-utils'],
};

module.exports = nextConfig;
