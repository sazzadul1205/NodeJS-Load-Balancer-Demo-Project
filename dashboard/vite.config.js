import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 5174 so it doesn't collide with the existing lb-demo form frontend on 5173.
  server: { port: 5174, strictPort: true },
});
