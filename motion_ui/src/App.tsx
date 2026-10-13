import { useState, useRef, useEffect, useCallback } from "react";
import type { MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";
import Login from "./Login";
import type { AuthUser, Conversation, Message } from "./api";
import {
  listConversations,
  createConversation,
  getMessages,
  deleteConversation,
  streamChat,
  getToken,
  clearToken,
  getMe,
  login,
  register,
  setUnauthorizedHandler,
} from "./api";

/* ------------------------------------------------------------------ */
/* Chat screen (only shown when logged in)                             */
/* ------------------------------------------------------------------ */
function Chat({ email, onLogout }: { email: string; onLogout: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const loadToken = useRef(0); // ignores stale responses when clicking chats quickly

  const refreshList = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch (err) {
      console.error("Could not load conversations", err);
    }
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Stop any streaming reply when this screen goes away (for example on logout)
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function newChat() {
    abortRef.current?.abort();
    loadToken.current++;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setLoading(false);
    setSidebarOpen(false);
  }

  async function openChat(id: number) {
    if (id === activeId) {
      setSidebarOpen(false);
      return;
    }
    abortRef.current?.abort(); // stop any reply still streaming
    setLoading(false);
    setActiveId(id);
    setMessages([]);
    setSidebarOpen(false);

    const token = ++loadToken.current;
    try {
      const loaded = await getMessages(id);
      if (token === loadToken.current) setMessages(loaded);
    } catch (err) {
      if (token === loadToken.current) {
        setMessages([
          {
            role: "assistant",
            content: `Could not load this chat: ${(err as Error).message}`,
          },
        ]);
      }
    }
  }

  async function removeChat(e: MouseEvent, id: number) {
    e.stopPropagation(); // don't also open the chat
    if (!confirm("Delete this chat?")) return;
    try {
      await deleteConversation(id);
      if (id === activeId) newChat();
      refreshList();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let id = activeId;
      if (id === null) {
        const created = await createConversation();
        id = created.id;
        setActiveId(id);
      }

      await streamChat(
        id,
        text,
        (token) =>
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = { ...last, content: last.content + token };
            return copy;
          }),
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `Something went wrong: ${(err as Error).message}`,
          };
          return copy;
        });
      }
    } finally {
      setLoading(false);
      refreshList(); // picks up the auto-generated title
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <button className="new-chat" onClick={newChat}>
          + New chat
        </button>

        <div className="chat-list">
          {conversations.length === 0 && <p className="empty-list">No chats yet</p>}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => openChat(c.id)}
              title={c.title}
            >
              <span className="chat-title">{c.title}</span>
              <button
                className="delete-btn"
                onClick={(e) => removeChat(e, c.id)}
                aria-label="Delete chat"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <span className="user-email" title={email}>
            {email}
          </span>
          <button className="logout-btn" onClick={onLogout}>
            Log out
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button
            className="menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open chats"
          >
            ☰
          </button>
          <h1>My Chat</h1>
        </header>

        <div className="chat">
          {messages.length === 0 && <div className="welcome">How can I help you today?</div>}
          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.content || (loading ? "Thinking..." : "")}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="input-row">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask anything..."
          />
          {loading ? (
            <button onClick={stop}>Stop</button>
          ) : (
            <button onClick={sendMessage} disabled={!input.trim()}>
              Send
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App: decides between loading, login page, and chat                   */
/* ------------------------------------------------------------------ */
export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);

  useEffect(() => {
    // If the server ever rejects our token, go back to the login page
    setUnauthorizedHandler(() => setUser(null));

    // If a token is saved, check that it is still valid
    if (getToken()) {
      getMe()
        .then(setUser)
        .catch(() => clearToken())
        .finally(() => setChecking(false));
    }
    return () => setUnauthorizedHandler(null);
  }, []);

  async function handleAuth(mode: "login" | "register", email: string, password: string) {
    const u = mode === "login" ? await login(email, password) : await register(email, password);
    setUser(u);
  }

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  if (checking) return <div className="center-screen">Loading...</div>;
  if (!user) return <Login onAuth={handleAuth} />;
  return <Chat email={user.email} onLogout={handleLogout} />;
}