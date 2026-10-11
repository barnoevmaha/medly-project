import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolved from import.meta.url rather than node:path so the config type-checks
// without @types/node installed. The regex strips the leading slash Windows
// file URLs carry ("/C:/..." -> "C:/...").
const srcDir = decodeURIComponent(
  new URL("./src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
);

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": srcDir } },
  server: { port: 5173 },
});
