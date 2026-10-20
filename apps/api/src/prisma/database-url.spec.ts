import { describe, expect, it } from 'vitest';
import { parseDatabaseUrl } from './database-url';

describe('parseDatabaseUrl', () => {
  it('maps a plain local URL without TLS', () => {
    expect(parseDatabaseUrl('mysql://recall:recall@127.0.0.1:3306/recall_studio')).toEqual({ host: '127.0.0.1', port: 3306, user: 'recall', password: 'recall', database: 'recall_studio' });
  });
  it('turns sslaccept=strict into verified TLS (TiDB Cloud)', () => {
    const c = parseDatabaseUrl('mysql://abc.root:p%40ss@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/recall_studio?sslaccept=strict&connection_limit=3');
    expect(c).toEqual({ host: 'gateway01.ap-northeast-1.prod.aws.tidbcloud.com', port: 4000, user: 'abc.root', password: 'p@ss', database: 'recall_studio', ssl: { rejectUnauthorized: true }, connectionLimit: 3 });
  });
  it('accept_invalid_certs keeps TLS but skips verification; ssl=false stays plain', () => {
    expect(parseDatabaseUrl('mysql://u:p@h/d?sslaccept=accept_invalid_certs').ssl).toEqual({ rejectUnauthorized: false });
    expect(parseDatabaseUrl('mysql://u:p@h/d?ssl=false').ssl).toBeUndefined();
  });
  it('rejects non-mysql URLs', () => {
    expect(() => parseDatabaseUrl('postgres://u:p@h/d')).toThrow(/mysql/);
  });
});
