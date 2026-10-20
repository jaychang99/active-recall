/**
 * Turns a Prisma-style MySQL URL into a mariadb connector config. The mariadb driver adapter ignores Prisma's
 * `sslaccept=strict` query flag and would connect in plaintext — which TiDB Cloud (and most managed MySQL)
 * reject — so TLS is switched on explicitly whenever the URL asks for it.
 */
export interface MariaDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
  connectionLimit?: number;
}

export function parseDatabaseUrl(url: string): MariaDbConfig {
  const u = new URL(url);
  if (u.protocol !== 'mysql:' && u.protocol !== 'mariadb:') throw new Error(`DATABASE_URL must start with mysql:// (got ${u.protocol})`);
  const sslaccept = u.searchParams.get('sslaccept');
  const sslFlag = u.searchParams.get('ssl');
  const wantsTls = sslaccept !== null || (sslFlag !== null && sslFlag !== 'false' && sslFlag !== '0');
  const cfg: MariaDbConfig = {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  if (wantsTls) cfg.ssl = { rejectUnauthorized: sslaccept !== 'accept_invalid_certs' };
  const limit = u.searchParams.get('connection_limit');
  if (limit && Number(limit) > 0) cfg.connectionLimit = Number(limit);
  return cfg;
}
