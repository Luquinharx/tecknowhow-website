// Servidor da API do site em produção (VM Oracle). O Caddy serve o site estático
// e encaminha só /api/* para aqui (127.0.0.1:3003).
import http from "node:http";
import { handleChat } from "./chat-middleware";
import { handleLeads } from "./leads";
import { db, hasDatabase } from "./db";
import { sendJson } from "./http-utils";

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOSTNAME || "127.0.0.1";

const server = http.createServer(async (req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/api/saude") {
    let banco = false;
    if (hasDatabase()) {
      try {
        await (await db()).query("SELECT 1");
        banco = true;
      } catch (err) {
        console.error("saude: banco", err);
      }
    }
    return sendJson(res, 200, { ok: true, glm: Boolean(process.env.GLM_API_KEY), banco });
  }
  if (path === "/api/chat") return void handleChat(req, res);
  if (path === "/api/leads") return void handleLeads(req, res);
  sendJson(res, 404, { error: "Não encontrado." });
});

server.listen(PORT, HOST, () => console.log(`API do site em http://${HOST}:${PORT}`));
