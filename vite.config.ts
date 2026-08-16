import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1_350,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.replaceAll("\\", "/").includes("/node_modules/phaser/")) return "phaser";
          return undefined;
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/socket.io": {
        target: "http://127.0.0.1:3000",
        ws: true,
      },
    },
  },
});
