import { API_URL } from './api';
import { getApiToken, redirectToLogin } from './auth-token';
import { withActivity } from './request-activity';

/** Authenticated download of an API resource (plain `<a href>` cannot carry the bearer token). */
export async function downloadFromApi(path: string, filename: string): Promise<void> {
  return withActivity('download', () => download(path, filename));
}

async function download(path: string, filename: string): Promise<void> {
  const token = await getApiToken();
  if (!token) {
    redirectToLogin();
    throw new Error('로그인이 필요합니다');
  }
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: '*/*' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
