/** @type {import('next').NextConfig} */
const nextConfig = {
  // firebase-admin é Node puro — não deve ser empacotado no bundle do servidor.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
