import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/witnesscam/",
  plugins: [react()],
  optimizeDeps: {
    include: ["@1sat/react", "@1sat/connect", "@1sat/actions", "@1sat/client"],
  },
  // @1sat/* ships extensionless ESM relative imports — Node's resolver
  // rejects them, so Vite must bundle these packages (SatPress does the same).
  ssr: {
    noExternal: [/^@1sat\//],
  },
  test: {
    environment: "node",
    server: {
      deps: {
        inline: [/^@1sat\//],
      },
    },
  },
});
