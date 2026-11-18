// Servidor da API do site em produção (VM Oracle). O Caddy serve o site estático
// e encaminha só /api/* para aqui (127.0.0.1:3003).
import http from "node:http";
import { handleChat } from "./chat-middleware";

const PORT = Number(process.env.PORT || 3003);
const HOST = process.env.HOSTNAME || "127.0.0.1";

const server = http.createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/api/saude") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, glm: Boolean(process.env.GLM_API_KEY) }));
  }
  if (path === "/api/chat") return void handleChat(req, res);
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Não encontrado." }));
});

server.listen(PORT, HOST, () => console.log(`API do site em http://${HOST}:${PORT}`));
