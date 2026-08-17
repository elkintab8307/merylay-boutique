import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Git worktrees viven en .worktrees/ (gitignored) dentro del repo; sin
    // esta exclusion, vitest tambien corre la copia del codigo que haya
    // dentro de un worktree activo, duplicando tests contra un
    // node_modules distinto y rompiendo los que renderizan React.
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
