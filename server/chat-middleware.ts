// Liga o handler /api/chat (Web Request/Response) a um servidor Node (http).
// Usado pelo servidor de produção (server/index.ts) e pelo Vite em desenvolvimento.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { POST as chatHandler } from "../api/chat";
import { clientIp, createRateLimiter, readBody, sendJson } from "./http-utils";

// Protege o custo da API: 40 mensagens / 10 minutos por IP.
const limited = createRateLimiter(40, 10 * 60 * 1000);

export async function handleChat(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método não permitido." });
  if (limited(clientIp(req))) return sendJson(res, 429, { error: "Demasiados pedidos. Tente daqui a pouco." });

  const body = await readBody(req);
  if (body === null) return sendJson(res, 413, { error: "Pedido demasiado grande." });

  try {
    const response = await chatHandler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }),
    );
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (!response.body) return res.end();
    Readable.fromWeb(response.body as never).pipe(res);
  } catch (err) {
    console.error("chat error", err);
    if (!res.headersSent) sendJson(res, 502, { error: "O assistente está indisponível de momento." });
    else res.end();
  }
}
