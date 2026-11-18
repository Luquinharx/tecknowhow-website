// Liga o handler /api/chat (Web Request/Response) a um servidor Node (http).
// Usado pelo servidor de produção (server/index.ts) e pelo Vite em desenvolvimento.
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { POST as chatHandler } from "../api/chat";

const MAX_BODY = 100_000; // bytes

// Limite simples por IP para proteger o custo da API: 40 pedidos / 10 minutos.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 40;
const hits = new Map<string, number[]>();

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
  }
  return recent.length > MAX_REQUESTS;
}

function clientIp(req: IncomingMessage) {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket.remoteAddress || "?";
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function handleChat(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método não permitido." });
  if (rateLimited(clientIp(req))) return sendJson(res, 429, { error: "Demasiados pedidos. Tente daqui a pouco." });

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return sendJson(res, 413, { error: "Pedido demasiado grande." });
    chunks.push(chunk as Buffer);
  }

  try {
    const response = await chatHandler(
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: Buffer.concat(chunks).toString("utf8"),
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
