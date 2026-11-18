// Login do painel de admin.
//   POST /api/admin/login  { email, password } -> { token, expiresAt }
// Credenciais só na VM (/etc/tecknowhow/app.env):
//   ADMIN_EMAIL, ADMIN_PASSWORD_HASH (scrypt:<salt hex>:<hash hex>), ADMIN_SESSION_SECRET
// Para gerar o hash: node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt:'+s.toString('hex')+':'+c.scryptSync(process.argv[1],s,64).toString('hex'))" 'palavra-passe'
import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { clientIp, createRateLimiter, readBody, sendJson } from "./http-utils";

const SESSION_MS = 12 * 60 * 60 * 1000;
const loginLimited = createRateLimiter(10, 15 * 60 * 1000);

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");

function sign(payload: string) {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(payload).digest();
}

function checkPassword(password: string) {
  // formato scrypt:<salt>:<hash> (aceita também "$" como separador)
  const [scheme, saltHex, hashHex] = (process.env.ADMIN_PASSWORD_HASH || "").split(/[:$]/);
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

function sameText(a: string, b: string) {
  const x = Buffer.from(a.trim().toLowerCase());
  const y = Buffer.from(b.trim().toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

function authConfigured() {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD_HASH && (process.env.ADMIN_SESSION_SECRET || "").length >= 32);
}

/** Valida o token de sessão (Authorization: Bearer <token>). */
export function isAdmin(req: IncomingMessage) {
  if (!authConfigured()) return false;
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return false;
  const [payload, sig] = header.slice(7).split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function handleLogin(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método não permitido." });
  if (!authConfigured()) return sendJson(res, 503, { error: "Login do painel não configurado." });

  const ip = clientIp(req);
  const raw = await readBody(req, 5_000);
  let email = "";
  let password = "";
  try {
    const data = JSON.parse(raw || "{}");
    email = typeof data.email === "string" ? data.email : "";
    password = typeof data.password === "string" ? data.password : "";
  } catch {
    /* corpo inválido = credenciais erradas */
  }

  const ok = email !== "" && password !== "" && sameText(email, process.env.ADMIN_EMAIL!) && checkPassword(password);
  if (!ok) {
    if (loginLimited(ip)) return sendJson(res, 429, { error: "Demasiadas tentativas. Tente daqui a 15 minutos." });
    return sendJson(res, 401, { error: "Email ou palavra-passe incorretos." });
  }

  const expiresAt = Date.now() + SESSION_MS;
  const payload = b64url(JSON.stringify({ sub: "admin", exp: expiresAt }));
  return sendJson(res, 200, { token: `${payload}.${b64url(sign(payload))}`, expiresAt });
}
