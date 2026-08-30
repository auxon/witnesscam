import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/witnesscam/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
