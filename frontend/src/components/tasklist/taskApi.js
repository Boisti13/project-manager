// API calls of the Tasks page, with the server's error text in the Error.
import { authFetch } from '../../context/AuthContext';

/** The server's error as text ("title: Field required", or its detail). */
export async function parseApiError(response) {
  try {
    const data = await response.json();
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(', ');
    }
    return data.detail || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function fetchJson(url, options) {
  const response = await authFetch(url, options);
  if (!response.ok) throw new Error(await parseApiError(response));
  return response.json();
}

/** POST / PUT with a JSON body. */
export const sendJson = (url, method, body) =>
  fetchJson(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
