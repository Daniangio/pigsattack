import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // This sets up an alias so that "@" points to the "src" directory.
      // It makes imports cleaner and less prone to pathing errors.
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // This is crucial for hot-reloading to work inside Docker.
    watch: {
      usePolling: true,
    },
    // We bind to 0.0.0.0 to make the server accessible from outside the container.
    host: "0.0.0.0",
  },
});
