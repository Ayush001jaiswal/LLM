const API = "http://localhost:5000/api";
const TOKEN_KEY = "token";

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface AuthUser {
  id: number;
  email: string;
}

// ---------- Token storage ----------
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// App registers a function here to be called when the server rejects our token
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function ensureOk(res: Response, isAuthCall = false): Promise<void> {
  if (res.ok) return;
  // A 401 on a normal request means the token is bad or expired: log out.
  // (On login/register, a 401 just means "wrong password", so don't log out.)
  if (res.status === 401 && !isAuthCall) {
    clearToken();
    onUnauthorized?.();
  }
  let message = `Request failed (${res.status})`;
  try {
    const data = await res.json();
    if (data?.error) message = data.error;
  } catch {
    /* response had no JSON body */
  }
  throw new Error(message);
}

// ---------- Auth ----------
async function authRequest(
  path: "login" | "register",
  email: string,
  password: string
): Promise<AuthUser> {
  const res = await fetch(`${API}/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await ensureOk(res, true);
  const data = (await res.json()) as { token: string; user: AuthUser };
  setToken(data.token);
  return data.user;
}

export const login = (email: string, password: string) => authRequest("login", email, password);
export const register = (email: string, password: string) =>
  authRequest("register", email, password);

export async function getMe(): Promise<AuthUser> {
  const res = await fetch(`${API}/auth/me`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

// ---------- Conversations ----------
export async function listConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API}/conversations`, { headers: authHeaders() });
  await ensureOk(res);
  return res.json();
}

export async function createConversation(): Promise<Conversation> {
  const res = await fetch(`${API}/conversations`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: "{}",
  });
  await ensureOk(res);
  return res.json();
}

export async function getMessages(id: number): Promise<Message[]> {
  const res = await fetch(`${API}/conversations/${id}/messages`, { headers: authHeaders() });
  await ensureOk(res);
  const data = await res.json();
  return data.messages as Message[];
}

export async function deleteConversation(id: number): Promise<void> {
  const res = await fetch(`${API}/conversations/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await ensureOk(res);
}

export async function streamChat(
  id: number,
  content: string,
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API}/conversations/${id}/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content }),
    signal,
  });
  await ensureOk(res);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}