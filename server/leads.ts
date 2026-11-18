// /api/leads
//   POST  cria um lead (público, usado pelo chat; ignora telemóvel repetido)
//   GET   lista os leads (painel de admin; Authorization: Bearer <token do /api/admin/login>)
import type { IncomingMessage, ServerResponse } from "node:http";
import { db, hasDatabase } from "./db";
import { isAdmin } from "./auth";
import { clientIp, createRateLimiter, readBody, sendJson } from "./http-utils";

const createLimited = createRateLimiter(10, 10 * 60 * 1000);

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function createLead(req: IncomingMessage, res: ServerResponse) {
  if (createLimited(clientIp(req))) return sendJson(res, 429, { error: "Demasiados pedidos." });
  const raw = await readBody(req, 20_000);
  if (raw === null) return sendJson(res, 413, { error: "Pedido demasiado grande." });

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: "Pedido inválido." });
  }

  const firstName = text(data.firstName, 100);
  const phone = text(data.phone, 30);
  const digits = phone.replace(/\D/g, "");
  if (firstName.length < 1 || digits.length < 9 || digits.length > 15) {
    return sendJson(res, 400, { error: "Nome ou telemóvel inválido." });
  }

  const pool = await db();
  const exists = await pool.query(
    "SELECT 1 FROM leads WHERE regexp_replace(phone, '\\D', '', 'g') = $1 LIMIT 1",
    [digits],
  );
  if (exists.rowCount) return sendJson(res, 200, { ok: true, existing: true });

  await pool.query(
    `INSERT INTO leads (first_name, phone, interest, service, location, timeline, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      firstName,
      phone,
      text(data.interest, 2000),
      text(data.service, 300),
      text(data.location, 200),
      text(data.timeline, 200),
      text(data.source, 50) || "site",
    ],
  );
  return sendJson(res, 201, { ok: true, existing: false });
}

async function listLeads(req: IncomingMessage, res: ServerResponse) {
  if (!isAdmin(req)) return sendJson(res, 401, { error: "Sessão expirada. Entre outra vez." });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT id, first_name AS "firstName", phone, interest, service, location, timeline, source,
            created_at AS "createdAt"
       FROM leads ORDER BY created_at DESC LIMIT 1000`,
  );
  return sendJson(res, 200, { leads: rows });
}

export async function handleLeads(req: IncomingMessage, res: ServerResponse) {
  if (!hasDatabase()) return sendJson(res, 503, { error: "Base de dados não configurada." });
  try {
    if (req.method === "POST") return await createLead(req, res);
    if (req.method === "GET") return await listLeads(req, res);
    return sendJson(res, 405, { error: "Método não permitido." });
  } catch (err) {
    console.error("leads error", err);
    if (!res.headersSent) sendJson(res, 500, { error: "Erro interno." });
  }
}
