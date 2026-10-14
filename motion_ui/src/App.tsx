import { useState, useRef, useEffect, useCallback, Fragment } from "react";
import type { MouseEvent, ChangeEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";
import Login from "./Login";
import type { AuthUser, Conversation, Message, DocInfo, StreamStart } from "./api";
import {
  listConversations,
  createConversation,
  getMessages,
  deleteConversation,
  renameConversation,
  streamChat,
  regenerateReply,
  editMessage,
  generateTitle,
  listDocuments,
  uploadDocument,
  deleteDocument,
  getToken,
  clearToken,
  getMe,
  login,
  register,
  setUnauthorizedHandler,
} from "./api";

/* ------------------------------------------------------------------ */
/* Dark mode                                                           */
/* ------------------------------------------------------------------ */
type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/* ------------------------------------------------------------------ */
/* Keep the open chat in the URL (survives refresh)                    */
/* ------------------------------------------------------------------ */
const CHAT_PARAM = "chat";

function readChatIdFromUrl(): number | null {
  const raw = new URLSearchParams(window.location.search).get(CHAT_PARAM);
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : null;
}

function writeChatIdToUrl(id: number | null) {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete(CHAT_PARAM);
  else url.searchParams.set(CHAT_PARAM, String(id));
  window.history.replaceState(null, "", url);
}

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard access was blocked */
    }
  }

  return (
    <button className="action-btn" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Chat screen (only shown when logged in)                             */
/* ------------------------------------------------------------------ */
interface ChatProps {
  email: string;
  onLogout: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

function Chat({ email, onLogout, theme, onToggleTheme }: ChatProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<number | null>(readChatIdFromUrl);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false); // a reply is streaming
  const [chatLoading, setChatLoading] = useState(() => readChatIdFromUrl() !== null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [documents, setDocuments] = useState<DocInfo[]>([]);
  const [uploading, setUploading] = useState(false);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [streamIndex, setStreamIndex] = useState<number | null>(null); // which message is being written


  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const loadToken = useRef(0); // ignores stale responses when clicking chats quickly
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const renamingRef = useRef<number | null>(null); // makes rename commit run only once

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

  // Keep the address bar in sync with the open chat
  useEffect(() => {
    writeChatIdToUrl(activeId);
  }, [activeId]);

  // On first load, restore the chat that was open before the refresh
  useEffect(() => {
    if (activeId === null) return;
    const id = activeId;
    const token = ++loadToken.current;

    getMessages(id)
      .then((loaded) => {
        if (token === loadToken.current) {
          setMessages(loaded);
          setChatLoading(false);
        }
      })
      .catch(() => {
        // Chat was deleted or belongs to another account: fall back to a new chat
        if (token === loadToken.current) {
          setActiveId(null);
          setChatLoading(false);
        }
      });

    listDocuments(id)
      .then((docs) => {
        if (token === loadToken.current) setDocuments(docs);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- helpers shared by send / regenerate / edit ---------- */

  // function appendToken(token: string) {
  //   setMessages((prev) => {
  //     const copy = [...prev];
  //     const last = copy[copy.length - 1];
  //     copy[copy.length - 1] = { ...last, content: last.content + token };
  //     return copy;
  //   });
  // }

  // // Runs when the server starts replying: attaches sources and the saved message id
  // function handleStart(info: StreamStart) {
  //   setMessages((prev) => {
  //     const copy = [...prev];
  //     const last = copy.length - 1;
  //     if (last >= 0) {
  //       copy[last] = { ...copy[last], sources: info.sources.length ? info.sources : null };
  //     }
  //     if (
  //       info.userMessageId !== null &&
  //       last >= 1 &&
  //       copy[last - 1].role === "user" &&
  //       copy[last - 1].id === undefined
  //     ) {
  //       copy[last - 1] = { ...copy[last - 1], id: info.userMessageId };
  //     }
  //     return copy;
  //   });
  // }

  // function showError(err: unknown) {
  //   if ((err as Error).name === "AbortError") return;
  //   setMessages((prev) => {
  //     const copy = [...prev];
  //     copy[copy.length - 1] = {
  //       role: "assistant",
  //       content: `Something went wrong: ${(err as Error).message}`,
  //     };
  //     return copy;
  //   });
  // }

  function appendTokenAt(index: number, token: string) {
    setMessages((prev) => {
      if (!prev[index]) return prev;
      const copy = [...prev];
      copy[index] = { ...copy[index], content: copy[index].content + token };
      return copy;
    });
  }

  // Runs when the server starts replying: attaches sources and the saved prompt id
  function handleStartAt(replyIndex: number, info: StreamStart) {
    setMessages((prev) => {
      const copy = [...prev];
      if (copy[replyIndex]) {
        copy[replyIndex] = {
          ...copy[replyIndex],
          sources: info.sources.length ? info.sources : null,
        };
      }
      const prompt = copy[replyIndex - 1];
      if (info.userMessageId !== null && prompt?.role === "user" && prompt.id === undefined) {
        copy[replyIndex - 1] = { ...prompt, id: info.userMessageId };
      }
      return copy;
    });
  }

  function showErrorAt(index: number, err: unknown) {
    if ((err as Error).name === "AbortError") return;
    setMessages((prev) => {
      if (!prev[index]) return prev;
      const copy = [...prev];
      copy[index] = {
        role: "assistant",
        content: `Something went wrong: ${(err as Error).message}`,
      };
      return copy;
    });
  }

  // Reloads the saved messages from the server (used after an edit is stopped or fails)
  async function syncMessages(chatId: number, controller: AbortController, delayMs = 0) {
    const token = loadToken.current; // captured first, so switching chats cancels this
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (abortRef.current !== controller) return; // a newer request has started
    try {
      const loaded = await getMessages(chatId);
      if (token === loadToken.current && abortRef.current === controller) setMessages(loaded);
    } catch {
      /* keep what is on screen */
    }
  }

  function cancelRename() {
    renamingRef.current = null;
    setRenamingId(null);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValue("");
  }

  /* ---------- chats ---------- */

  function newChat() {
    abortRef.current?.abort();
    loadToken.current++;
    setActiveId(null);
    setMessages([]);
    setDocuments([]);
    setInput("");
    setLoading(false);
    setStreamIndex(null);
    setChatLoading(false);
    cancelEdit();
    cancelRename();
    setSidebarOpen(false);
  }

  async function openChat(id: number) {
    if (id === activeId) {
      setSidebarOpen(false);
      return;
    }
    abortRef.current?.abort(); // stop any reply still streaming
    setLoading(false);
    setStreamIndex(null);
    setActiveId(id);
    setMessages([]);
    setDocuments([]);
    setChatLoading(true);
    cancelEdit();
    cancelRename();
    setSidebarOpen(false);

    const token = ++loadToken.current;

    listDocuments(id)
      .then((docs) => {
        if (token === loadToken.current) setDocuments(docs);
      })
      .catch(() => {});

    try {
      const loaded = await getMessages(id);
      if (token === loadToken.current) {
        setMessages(loaded);
        setChatLoading(false);
      }
    } catch (err) {
      if (token === loadToken.current) {
        setMessages([
          { role: "assistant", content: `Could not load this chat: ${(err as Error).message}` },
        ]);
        setChatLoading(false);
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

  /* ---------- rename ---------- */

  function startRename(e: MouseEvent, c: Conversation) {
    e.stopPropagation();
    renamingRef.current = c.id;
    setRenamingId(c.id);
    setRenameValue(c.title);
  }

  async function commitRename() {
    const id = renamingRef.current;
    if (id === null) return; // already handled (Enter and blur can both fire)
    renamingRef.current = null;
    setRenamingId(null);

    const title = renameValue.trim();
    const current = conversations.find((c) => c.id === id);
    if (!title || !current || title === current.title) return;

    try {
      const updated = await renameConversation(id, title);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  /* ---------- documents ---------- */

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the user pick the same file again later
    if (!file || uploading) return;

    setUploading(true);
    try {
      let id = activeId;
      if (id === null) {
        const created = await createConversation();
        id = created.id;
        setActiveId(id);
        refreshList();
      }
      const doc = await uploadDocument(id, file);
      setDocuments((prev) => [...prev, doc]);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(docId: number) {
    if (activeId === null) return;
    try {
      await deleteDocument(activeId, docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  /* ---------- send / regenerate / edit ---------- */

  // async function sendMessage() {
  //   const text = input.trim();
  //   if (!text || loading || chatLoading) return;

  //   setInput("");
  //   setLoading(true);
  //   setMessages((prev) => [
  //     ...prev,
  //     { role: "user", content: text },
  //     { role: "assistant", content: "" },
  //   ]);

  //   const controller = new AbortController();
  //   abortRef.current = controller;

  //   let titleForId: number | null = null;

  //   try {
  //     let id = activeId;
  //     if (id === null) {
  //       const created = await createConversation();
  //       id = created.id;
  //       setActiveId(id);
  //     }
  //     if (messages.length === 0) titleForId = id; // first message in this chat

  //     await streamChat(id, text, handleStart, appendToken, controller.signal);
  //   } catch (err) {
  //     showError(err);
  //   } finally {
  //     setLoading(false);
  //     refreshList();
  //     if (titleForId !== null) {
  //       generateTitle(titleForId).then(refreshList).catch(() => {});
  //     }
  //   }
  // }

  // async function regenerate() {
  //   if (loading || activeId === null) return;
  //   const last = messages[messages.length - 1];
  //   if (!last || last.role !== "assistant") return;

  //   setLoading(true);
  //   setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: "" }]);

  //   const controller = new AbortController();
  //   abortRef.current = controller;

  //   try {
  //     await regenerateReply(activeId, handleStart, appendToken, controller.signal);
  //   } catch (err) {
  //     showError(err);
  //   } finally {
  //     setLoading(false);
  //     refreshList();
  //   }
  // }

  async function sendMessage() {
  const text = input.trim();
  if (!text || loading || chatLoading) return;

  const replyIndex = messages.length + 1; // after the new prompt
  setInput("");
  setLoading(true);
  setStreamIndex(replyIndex);
  setMessages((prev) => [
    ...prev,
    { role: "user", content: text },
    { role: "assistant", content: "" },
  ]);

  const controller = new AbortController();
  abortRef.current = controller;

  let titleForId: number | null = null;

  try {
    let id = activeId;
    if (id === null) {
      const created = await createConversation();
      id = created.id;
      setActiveId(id);
    }
    if (messages.length === 0) titleForId = id; // first message in this chat

    await streamChat(
      id,
      text,
      (info) => handleStartAt(replyIndex, info),
      (token) => appendTokenAt(replyIndex, token),
      controller.signal
    );
  } catch (err) {
    showErrorAt(replyIndex, err);
  } finally {
    setLoading(false);
    setStreamIndex(null);
    refreshList();
    if (titleForId !== null) {
      generateTitle(titleForId).then(refreshList).catch(() => {});
    }
  }
}

  async function regenerate() {
    if (loading || activeId === null) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;

    const replyIndex = messages.length - 1;
    setLoading(true);
    setStreamIndex(replyIndex);
    setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await regenerateReply(
        activeId,
        (info) => handleStartAt(replyIndex, info),
        (token) => appendTokenAt(replyIndex, token),
        controller.signal
      );
    } catch (err) {
      showErrorAt(replyIndex, err);
    } finally {
      setLoading(false);
      setStreamIndex(null);
      refreshList();
    }
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditValue(messages[index].content);
  }

  async function saveEdit() {
    if (editingIndex === null || activeId === null || loading) return;

    const index = editingIndex;
    const target = messages[index];
    const text = editValue.trim();
    if (!target?.id || !text) return;

    const chatId = activeId;
    const messageId = target.id;
    const replyIndex = index + 1; // the reply right after this prompt

    cancelEdit();
    setLoading(true);
    setStreamIndex(replyIndex);

    // Editing branches the chat here, so later prompts and replies are removed.
    setMessages((prev) => {
      const copy = prev.slice(0, index + 1);
      copy[index] = { ...copy[index], content: text };
      return [...copy, { role: "assistant", content: "", sources: null }];
    });

    const controller = new AbortController();
    abortRef.current = controller;
    let outcome: "ok" | "aborted" | "failed" = "ok";

    try {
      await editMessage(
        chatId,
        messageId,
        text,
        (info) => handleStartAt(replyIndex, info),
        (token) => appendTokenAt(replyIndex, token),
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        outcome = "aborted";
      } else {
        outcome = "failed";
        alert((err as Error).message);
      }
    } finally {
      setLoading(false);
      setStreamIndex(null);
      refreshList();
      // After a stop or an error, show what the server actually saved.
      // A stopped reply is saved a moment later, so wait briefly first.
      if (outcome === "failed") syncMessages(chatId, controller);
      if (outcome === "aborted") syncMessages(chatId, controller, 600);
    }
  }


  // async function saveEdit() {
  //   if (editingIndex === null || activeId === null || loading) return;

  //   const index = editingIndex;
  //   const target = messages[index];
  //   const text = editValue.trim();
  //   if (!target?.id || !text) return;

  //   if (index < messages.length - 1) {
  //     if (!confirm("Editing removes all messages after this one. Continue?")) return;
  //   }

  //   const chatId = activeId;
  //   const messageId = target.id;

  //   cancelEdit();
  //   setLoading(true);
  //   setMessages((prev) => [
  //     ...prev.slice(0, index),
  //     { id: messageId, role: "user", content: text },
  //     { role: "assistant", content: "" },
  //   ]);

  //   const controller = new AbortController();
  //   abortRef.current = controller;

  //   try {
  //     await editMessage(chatId, messageId, text, handleStart, appendToken, controller.signal);
  //   } catch (err) {
  //     showError(err);
  //   } finally {
  //     setLoading(false);
  //     refreshList();
  //   }
  // }

  function stop() {
    abortRef.current?.abort();
  }

  /* ---------- render ---------- */

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
              onClick={() => renamingId !== c.id && openChat(c.id)}
              title={c.title}
            >
              {renamingId === c.id ? (
                <input
                  className="rename-input"
                  value={renameValue}
                  maxLength={100}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                />
              ) : (
                <>
                  <span className="chat-title" onDoubleClick={(e) => startRename(e, c)}>
                    {c.title}
                  </span>
                  <span className="chat-buttons">
                    <button
                      className="icon-btn"
                      onClick={(e) => startRename(e, c)}
                      aria-label="Rename chat"
                      title="Rename"
                    >
                      ✎
                    </button>
                    <button
                      className="icon-btn delete"
                      onClick={(e) => removeChat(e, c.id)}
                      aria-label="Delete chat"
                      title="Delete"
                    >
                      ×
                    </button>
                  </span>
                </>
              )}
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
          <button
            className="theme-btn"
            onClick={onToggleTheme}
            aria-label="Toggle dark mode"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </header>

        <div className="chat">
          {chatLoading && <div className="welcome">Loading chat...</div>}
          {!chatLoading && messages.length === 0 && (
            <div className="welcome">How can I help you today?</div>
          )}

          {/* {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const streaming = loading && isLast && m.role === "assistant";
            const editing = editingIndex === i;

            return (
              <Fragment key={i}>
                {editing ? (
                  <div className="edit-box">
                    <textarea
                      value={editValue}
                      rows={3}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        }
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <div className="edit-actions">
                      <button className="action-btn" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button
                        className="action-btn primary"
                        onClick={saveEdit}
                        disabled={!editValue.trim()}
                      >
                        Save &amp; resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`msg ${m.role}`}>
                    {m.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content || (loading ? "Thinking..." : "")}
                      </ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                )}

                {m.role === "user" && m.id !== undefined && !loading && !editing && (
                  <div className="msg-actions right">
                    <button
                      className="action-btn"
                      onClick={() => startEdit(i)}
                      title="Edit this message (removes the replies after it)"
                    >
                      Edit
                    </button>
                  </div>
                )}

                {m.role === "assistant" && m.content && !streaming && (
                  <div className="msg-actions">
                    <CopyButton text={m.content} />
                    {isLast && (
                      <button className="action-btn" onClick={regenerate}>
                        Regenerate
                      </button>
                    )}
                  </div>
                )}

                {m.role === "assistant" && !streaming && m.sources && m.sources.length > 0 && (
                  <details className="sources">
                    <summary>Sources ({m.sources.length})</summary>
                    <p className="sources-note">
                      Excerpts from your documents that were given to the model for this answer.
                    </p>
                    {m.sources.map((s) => (
                      <div key={s.n} className="source">
                        <div className="source-title">
                          📄 {s.filename} · Excerpt {s.n}
                        </div>
                        <p>{s.content}</p>
                      </div>
                    ))}
                  </details>
                )}
              </Fragment>
            );
          })} */}
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            const streaming = loading && streamIndex === i;
            const editing = editingIndex === i;

            return (
              <Fragment key={i}>
                {editing ? (
                  <div className="edit-box">
                    <textarea
                      value={editValue}
                      rows={3}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveEdit();
                        }
                        if (e.key === "Escape") cancelEdit();
                      }}
                    />
                    <p className="edit-hint">
                      Later messages will be removed when you save and resend this prompt.
                    </p>
                    <div className="edit-actions">
                      <button className="action-btn" onClick={cancelEdit}>
                        Cancel
                      </button>
                      <button
                        className="action-btn primary"
                        onClick={saveEdit}
                        disabled={!editValue.trim()}
                      >
                        Save &amp; resend
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`msg ${m.role}`}>
                    {m.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content || (streaming ? "Thinking..." : "")}
                      </ReactMarkdown>
                    ) : (
                      m.content
                    )}
                  </div>
                )}

                {m.role === "user" && !editing && (
                  <div className="msg-actions right">
                    <CopyButton text={m.content} />
                    {m.id !== undefined && !loading && (
                      <button
                        className="action-btn"
                        onClick={() => startEdit(i)}
                        title="Edit this prompt and regenerate its reply"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )}

                {m.role === "assistant" && m.content && !streaming && (
                  <div className="msg-actions">
                    <CopyButton text={m.content} />
                    {isLast && !loading && (
                      <button className="action-btn" onClick={regenerate}>
                        Regenerate
                      </button>
                    )}
                  </div>
                )}

                {m.role === "assistant" && !streaming && m.sources && m.sources.length > 0 && (
                  <details className="sources">
                    <summary>Sources ({m.sources.length})</summary>
                    <p className="sources-note">
                      Excerpts from your documents that were given to the model for this answer.
                    </p>
                    {m.sources.map((s) => (
                      <div key={s.n} className="source">
                        <div className="source-title">
                          📄 {s.filename} · Excerpt {s.n}
                        </div>
                        <p>{s.content}</p>
                      </div>
                    ))}
                  </details>
                )}
              </Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {documents.length > 0 && (
          <div className="doc-chips">
            {documents.map((d) => (
              <span key={d.id} className="doc-chip" title={d.filename}>
                📄 <span className="doc-name">{d.filename}</span>
                <button onClick={() => removeDoc(d.id)} aria-label="Remove document">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="input-row">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFile}
            hidden
          />
          <button
            className="attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            title="Attach a PDF, TXT or MD file"
          >
            {uploading ? "Reading..." : "📎"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={documents.length ? "Ask about your document..." : "Ask anything..."}
          />
          {loading ? (
            <button onClick={stop}>Stop</button>
          ) : (
            <button onClick={sendMessage} disabled={!input.trim() || chatLoading}>
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
  const { theme, toggle } = useTheme();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      writeChatIdToUrl(null);
      setUser(null);
    });

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
    writeChatIdToUrl(null);
    clearToken();
    setUser(null);
  }

  if (checking) return <div className="center-screen">Loading...</div>;
  if (!user) return <Login onAuth={handleAuth} />;
  return <Chat email={user.email} onLogout={handleLogout} theme={theme} onToggleTheme={toggle} />;
}