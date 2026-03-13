import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health": "http://localhost:3000",
      "/metrics": "http://localhost:3000",
      "/runs": "http://localhost:3000",
      "/files": "http://localhost:3000",
      "/tasks": "http://localhost:3000",
      "/tasks/stream": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true,
      },
      "/index": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
  },
});

