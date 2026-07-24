export class ApiError extends Error {}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch (_) {
    return {};
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const data = await parseJson(res);
  if (!res.ok) {
    throw new ApiError(data.message || data.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export const api = {
  me: () => fetch('/api/auth/me'),
  login: (username: string, password: string) =>
    request<{ user: { username: string; role: 'admin' | 'user' } }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => fetch('/api/auth/logout', { method: 'POST' }),
  changePassword: (oldPassword: string, newPassword: string) =>
    request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  listUsers: () => request<import('./types').UserAccount[]>('/api/users'),
  createUser: (username: string, password: string) =>
    request('/api/users', { method: 'POST', body: JSON.stringify({ username, password }) }),
  deleteUser: (id: number | string) => request(`/api/users/${id}`, { method: 'DELETE' }),

  getAuctions: () =>
    request<{ auctions: import('./types').Auction[]; lastRefresh: string | null }>('/api/auctions'),
  clearAuctions: (password: string) =>
    request('/api/auctions', { method: 'DELETE', body: JSON.stringify({ password }) }),

  getFavorites: () => request<string[]>('/api/favorites'),
  addFavorite: (id: string) => request(`/api/favorites/${encodeURIComponent(id)}`, { method: 'POST' }),
  removeFavorite: (id: string) => request(`/api/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  refreshAuction: (id: string) =>
    request<import('./types').Auction>(`/api/refresh/${encodeURIComponent(id)}`, { method: 'POST' }),

  aiFilter: (description: string, ids: string[]) =>
    request<{ matchingIds: string[] }>('/api/ai-filter', {
      method: 'POST',
      body: JSON.stringify({ description, ids }),
    }),

  getScheduleSettings: () => request<import('./types').ScheduleSettings>('/api/scheduler/settings'),
  putScheduleSettings: (preset: string, cron?: string) =>
    request<import('./types').ScheduleCurrent>('/api/scheduler/settings', {
      method: 'PUT',
      body: JSON.stringify({ preset, cron }),
    }),
};
