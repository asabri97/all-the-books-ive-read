import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { librarySearchPlugin } from "./server/librarySearchPlugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), librarySearchPlugin()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
