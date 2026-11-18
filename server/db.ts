// Ligação ao Postgres da VM (credenciais em /etc/bancos/tecknowhow.env -> DATABASE_URL).
import pg from "pg";

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

// Só cria o que falta (IF NOT EXISTS): nunca apaga nem altera dados existentes.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id           bigserial PRIMARY KEY,
  first_name   text        NOT NULL,
  phone        text        NOT NULL,
  interest     text        NOT NULL DEFAULT '',
  service      text        NOT NULL DEFAULT '',
  location     text        NOT NULL DEFAULT '',
  timeline     text        NOT NULL DEFAULT '',
  source       text        NOT NULL DEFAULT 'site',
  firestore_id text        UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_phone_idx ON leads (phone);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
`;

export async function db(): Promise<pg.Pool> {
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 });
    pool.on("error", (err) => console.error("pg pool error", err));
  }
  if (!schemaReady) {
    schemaReady = pool.query(SCHEMA).then(() => undefined);
    schemaReady.catch(() => {
      schemaReady = null; // tenta outra vez no próximo pedido
    });
  }
  await schemaReady;
  return pool;
}
