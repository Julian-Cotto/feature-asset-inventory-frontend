import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const isMicrofrontendBuild = mode === "mf";
  const localPort = 3200;

  // In local dev the shell proxies /_mfe/asset-inventory/* → :3200 so the MFE
  // is served same-origin (one ngrok tunnel covers everything). Setting base
  // makes Vite emit all import URLs with that prefix, so child imports also
  // route through the proxy. The lib build (mode === "mf") keeps default base.
  const sharedBase = isMicrofrontendBuild ? "/" : "/_mfe/asset-inventory/";

  const sharedConfig = {
    base: sharedBase,
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: localPort,
      allowedHosts: true,
      cors: {
        origin: [
          "http://localhost:3000",
          "http://localhost:3200",
          "http://localhost:3300",
          "http://localhost:5173",
        ],
        methods: ["GET", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Accept"],
        credentials: true,
      },
      proxy: {
        "/api/inventory/it": {
          target: "http://localhost:8200",
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/tests/setup.ts",
      globals: true,
    },
  };

  if (isMicrofrontendBuild) {
    return {
      ...sharedConfig,
      build: {
        lib: {
          entry: "src/bootstrap-entry.tsx",
          name: "ITAssetInventoryFeature",
          fileName: () => "bootstrap.js",
          formats: ["es"],
        },
        outDir: "dist/mf",
        emptyOutDir: true,
      },
    };
  }

  return {
    ...sharedConfig,
    build: {
      outDir: "dist/app",
      emptyOutDir: true,
    },
  };
});