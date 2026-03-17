import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/slide-analytics/",
  optimizeDeps: {
    exclude: ["@jsquash/jpeg", "@jsquash/oxipng", "@jsquash/png"],
  },
});
