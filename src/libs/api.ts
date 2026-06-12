/**
 * API Client
 *
 * Thin wrapper around fetch() for all calls to the A3 Cargo backend.
 * Automatically attaches the JWT Bearer token to every authenticated request.
 * On 401 responses the local credentials are cleared so the login screen
 * is shown the next time the page loads.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface UserSummary {
  id: number;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
}

export interface ProjectSummary {
  id: number;
  owner_id: number;
  owner_name: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectFull extends ProjectSummary {
  /** Parsed SavedLoad object */
  data: object;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** In production, the frontend and API are on the same origin so /api works. */
export const API_BASE = '/api';

const TOKEN_KEY = 'a3_token';
const USER_KEY  = 'a3_user';

// ── Token / auth state helpers ────────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ── Low-level fetch wrapper ───────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (authenticated) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token expired or invalid — force re-login on next page load
    clearAuth();
    window.location.reload();
    throw new Error('Session expired');
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }

  return body as T;
}

// ── Auth endpoints ────────────────────────────────────────────────────────────

/** Exchange credentials for a JWT. Stores the token and user locally. */
export async function apiLogin(username: string, password: string): Promise<AuthUser> {
  const result = await request<{ token: string; user: AuthUser }>(
    '/login',
    { method: 'POST', body: JSON.stringify({ username, password }) },
    false,
  );
  setToken(result.token);
  setStoredUser(result.user);
  return result.user;
}

/** Get the current authenticated user (validates the stored token). */
export async function apiGetMe(): Promise<AuthUser> {
  return request<AuthUser>('/me');
}

// ── Projects endpoints ────────────────────────────────────────────────────────

/** List all projects (summary, no data blob). */
export async function apiListProjects(): Promise<ProjectSummary[]> {
  return request<ProjectSummary[]>('/projects');
}

/** Fetch a single project including its full data blob. */
export async function apiGetProject(id: number): Promise<ProjectFull> {
  return request<ProjectFull>(`/projects/${id}`);
}

/** Create a new project. Editor-only. */
export async function apiCreateProject(name: string, data: object): Promise<ProjectFull> {
  return request<ProjectFull>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name, data }),
  });
}

/** Update an existing project. Editor-only. */
export async function apiUpdateProject(
  id: number,
  fields: { name?: string; data?: object },
): Promise<ProjectFull> {
  return request<ProjectFull>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fields),
  });
}

/** Delete a project. Editor-only. */
export async function apiDeleteProject(id: number): Promise<void> {
  await request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' });
}

// ── User management endpoints (admin-only) ────────────────────────────────────

/** List all users. Admin-only. */
export async function apiListUsers(): Promise<UserSummary[]> {
  return request<UserSummary[]>('/users');
}

/** Create a new user. Admin-only. */
export async function apiCreateUser(
  username: string,
  password: string,
  role: 'admin' | 'editor' | 'viewer',
): Promise<UserSummary> {
  return request<UserSummary>('/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });
}

/** Change a user's role. Admin-only. */
export async function apiUpdateUserRole(
  id: number,
  role: 'admin' | 'editor' | 'viewer',
): Promise<UserSummary> {
  return request<UserSummary>(`/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

/** Delete a user. Admin-only. */
export async function apiDeleteUser(id: number): Promise<void> {
  await request<{ success: boolean }>(`/users/${id}`, { method: 'DELETE' });
}
