import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fablePlugin, proxy, loadServerEnv } from "./vite.config";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  loadServerEnv(mode);
  return {
    plugins: [
      react(),
      fablePlugin(),
      {
        name: "part-ext-index",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const path = req.url?.split("?")[0];
            if (req.url === "/" || req.url === "/index.html")
              req.url = "/popup.html";
            next();
          });
        },
      },
      {
        name: "part-ext-manifest",
        closeBundle() {
          const out = resolve(root, "dist-ext");
          mkdirSync(out, { recursive: true });
          cpSync(
            resolve(root, "extension/README.txt"),
            resolve(out, "README.txt"),
          );
          cpSync(
            resolve(root, "public/tail-mascot"),
            resolve(out, "tail-mascot"),
            { recursive: true },
          );
          cpSync(
            resolve(root, "extension/manifest.json"),
            resolve(out, "manifest.json"),
          );
          cpSync(resolve(root, "extension/background.js"), resolve(out, "background.js"));
          mkdirSync(resolve(out, "icons"), { recursive: true });
          for (const size of ["16", "32", "48", "128"]) {
            cpSync(
              resolve(root, `extension/icons/${size}.png`),
              resolve(out, `icons/${size}.png`),
            );
          }
        },
      },
    ],
    base: "./",
    publicDir: false,
    define: {
      "import.meta.env.VITE_PART_SHELL": JSON.stringify("ext"),
      "import.meta.env.VITE_TAIL_API_URL": JSON.stringify(""),
      "import.meta.env.VITE_TAIL_STANDALONE": JSON.stringify("1"),
    },
    server: {
      cors: false,
      port: 4666,
      proxy,
    },
    preview: {
      cors: false,
      port: 4666,
      proxy,
    },
    build: {
      outDir: "dist-ext",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(root, "popup.html"),
        },
      },
    },
  };
});
