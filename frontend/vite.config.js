import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // This is the crucial part for Hot Reloading to work inside Docker
    watch: {
      usePolling: true,
    },
  },
});
