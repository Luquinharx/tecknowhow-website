import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { handleChat } from "./server/chat-middleware";
import { handleLeads } from "./server/leads";

// Serve /api/chat em desenvolvimento com o mesmo código do servidor de produção.
const devApi = (): Plugin => ({
  name: "dev-api-chat",
  configureServer(server) {
    server.middlewares.use("/api/chat", (req, res) => void handleChat(req, res));
    // leads: só funciona em dev com DATABASE_URL no .env (ex.: túnel SSH ao Postgres da VM)
    server.middlewares.use("/api/leads", (req, res) => void handleLeads(req, res));
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Disponibiliza variáveis sem prefixo VITE_ (ex.: GLM_API_KEY) só no servidor.
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["GLM_API_KEY", "GLM_MODEL", "GLM_BASE_URL", "GLM_REASONING_EFFORT", "DATABASE_URL", "ADMIN_PASSWORD"]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [react(), devApi(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
