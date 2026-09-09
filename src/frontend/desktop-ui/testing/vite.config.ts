import { resolve } from "node:path";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "showcase.tsx"),
      formats: ["es"],
      name: "DesktopUiInternalShowcase",
    },
  },
  plugins: [solidPlugin()],
  root: import.meta.dirname,
});
