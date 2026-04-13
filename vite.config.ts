import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const devHost = env.VITE_DEV_HOST || "127.0.0.1";

  return {
    server: {
      host: devHost,
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: supabaseUrl
        ? {
            "/api/functions": {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/api\/functions/, "/functions/v1"),
            },
          }
        : undefined,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
