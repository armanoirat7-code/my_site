import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function copySiteData() {
  return {
    name: "copy-site-data",
    closeBundle() {
      const products = resolve("data/products.json");
      if (existsSync(products)) {
        const dest = resolve("dist/data/products.json");
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(products, dest);
      }
      if (existsSync("uploads")) cpSync("uploads", resolve("dist/uploads"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), copySiteData()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:5190",
      "/uploads": "http://127.0.0.1:5190",
    },
  },
});
