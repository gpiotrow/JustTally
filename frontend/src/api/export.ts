import { ApiError, getToken } from './client';

/**
 * Download the server-side account export (`GET /api/export`) and save it.
 * Same reasoning as `downloadExerciseCsv`: a plain `<a href>` cannot carry
 * the Authorization header this endpoint requires, so the file is fetched as
 * a blob and saved via a synthetic link instead.
 */
export async function downloadAccountExport(): Promise<void> {
  const token = getToken();
  const res = await fetch('/api/export', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // non-JSON error
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'just-tally-export.json';
  a.click();
  URL.revokeObjectURL(url);
}
