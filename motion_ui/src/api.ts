export const API = "http://localhost:5000/api";
const TOKEN_KEY = "token";

export interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  n: number;
  filename: string;
  content: string;
}

export interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  quote?: string | null;
  sources?: Source[] | null;
}

export interface AuthUser {
  id: number;
  email: string;
}

export interface DocInfo {
  id: number;
  filename: string;
  createdAt: string;
}

// What the server tells us before the reply text starts streaming
export interface StreamStart {
  sources: Source[];
  userMessageId: number | null;
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

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export  function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export async function ensureOk(res: Response, isAuthCall = false): Promise<void> {
  if (res.ok) return;
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

export async function renameConversation(id: number, title: string): Promise<Conversation> {
  const res = await fetch(`${API}/conversations/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title }),
  });
  await ensureOk(res);
  return res.json();
}

export async function generateTitle(id: number): Promise<string> {
  const res = await fetch(`${API}/conversations/${id}/title`, {
    method: "POST",
    headers: authHeaders(),
  });
  await ensureOk(res);
  const data = await res.json();
  return data.title as string;
}

// ---------- Documents ----------
export async function listDocuments(conversationId: number): Promise<DocInfo[]> {
  const res = await fetch(`${API}/conversations/${conversationId}/documents`, {
    headers: authHeaders(),
  });
  await ensureOk(res);
  return res.json();
}

export async function uploadDocument(conversationId: number, file: File): Promise<DocInfo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/conversations/${conversationId}/documents`, {
    method: "POST",
    headers: authHeaders(), // no Content-Type: the browser sets it for FormData
    body: form,
  });
  await ensureOk(res);
  return res.json();
}

export async function deleteDocument(conversationId: number, docId: number): Promise<void> {
  const res = await fetch(`${API}/conversations/${conversationId}/documents/${docId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await ensureOk(res);
}

// ---------- Streaming ----------
function readStartInfo(res: Response): StreamStart {
  let sources: Source[] = [];
  const raw = res.headers.get("X-Sources");
  if (raw) {
    try {
      const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      sources = JSON.parse(new TextDecoder().decode(bytes)) as Source[];
    } catch {
      /* ignore a malformed header: the answer still works without sources */
    }
  }
  const id = Number(res.headers.get("X-User-Message-Id"));
  return { sources, userMessageId: Number.isInteger(id) && id > 0 ? id : null };
}

async function readStream(
  res: Response,
  onStart: (info: StreamStart) => void,
  onToken: (text: string) => void
): Promise<void> {
  onStart(readStartInfo(res));

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}

export async function streamChat(
  id: number,
  content: string,
  quote: string | undefined,
  onStart: (info: StreamStart) => void,
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API}/conversations/${id}/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content, quote }),
    signal,
  });
  await ensureOk(res);
  await readStream(res, onStart, onToken);
}

export async function regenerateReply(
  id: number,
  onStart: (info: StreamStart) => void,
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API}/conversations/${id}/regenerate`, {
    method: "POST",
    headers: authHeaders(),
    signal,
  });
  await ensureOk(res);
  await readStream(res, onStart, onToken);
}

export async function editMessage(
  id: number,
  messageId: number,
  content: string,
  onStart: (info: StreamStart) => void,
  onToken: (text: string) => void,
  signal: AbortSignal
): Promise<void> {
  const res = await fetch(`${API}/conversations/${id}/messages/${messageId}/edit`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ content }),
    signal,
  });
  await ensureOk(res);
  await readStream(res, onStart, onToken);
}