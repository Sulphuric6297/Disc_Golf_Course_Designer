import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // (the HyzerLab server, when one runs beside the dev server: see server/)
  server: { proxy: { "/api": process.env.HYZERLAB_API ?? "http://127.0.0.1:8787" } },
});
