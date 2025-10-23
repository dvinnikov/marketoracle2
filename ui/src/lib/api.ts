const RAW_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '');

export const API_BASE_URL = RAW_API_BASE;
export const WS_BASE_URL = RAW_API_BASE.startsWith('https')
  ? `wss${RAW_API_BASE.slice(5)}`
  : RAW_API_BASE.startsWith('http')
    ? `ws${RAW_API_BASE.slice(4)}`
    : RAW_API_BASE;

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method: init?.method ?? 'GET',
  });
  return handleResponse<T>(response);
}

export async function apiPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    body: JSON.stringify(body),
    ...init,
  });
  return handleResponse<T>(response);
}

