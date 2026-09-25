import { useEffect, useRef, useState, type FormEvent } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ArrowDown, ArrowUp, CircleHelp, Menu, MessageSquarePlus, Plus, Trash2, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ChatCardRenderer } from "../cards/ChatCardRenderer";
import type { ChatCardMessage } from "../cards/types";
import type { AuthMode } from "../cards/types-auth";
import { Brand } from "../components/Brand";
import { auth } from "../firebase";
import { db, functions } from "../firebaseServices";

type Message = ChatCardMessage;
type ChatMeta = { id: string; title: string; updatedAt?: { toMillis?: () => number } };
type AskRequest = { message: string; conversationId?: string };
type ReplyData = { text: string; card?: "account-access"; conversationId?: string };
type Chunk = { text?: string };
const suggestions = ["What is Razzberry?", "How could it help musicians?", "What does blockchain have to do with it?"];
const ask = httpsCallable<AskRequest, ReplyData, Chunk>(functions, "askRazzberry", { timeout: 120_000 });
const transfer = httpsCallable<{ messages: Message[]; conversationId?: string }, { conversationId: string }>(functions, "adoptGuestConversation");
const removeChat = httpsCallable<{ conversationId: string }, { deleted: boolean }>(functions, "deleteConversation");

export function Home({ initialAuthMode }: { initialAuthMode?: AuthMode } = {}) {
  const { user } = useAuth();
  const location = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [chatList, setChatList] = useState<ChatMeta[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode ?? modeFromPath(location.pathname));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [mobileKeyboard, setMobileKeyboard] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!user) { setChatList([]); return; }
    return onSnapshot(query(collection(db, "users", user.uid, "conversations"), orderBy("updatedAt", "desc")), (snapshot) => {
      setChatList(snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ChatMeta, "id">) })));
    });
  }, [user]);
  useEffect(() => { setAuthMode(initialAuthMode ?? modeFromPath(location.pathname)); }, [initialAuthMode, location.pathname]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const keyboard = window.innerHeight - vv.height - vv.offsetTop;
      setMobileKeyboard(keyboard > 120 && window.innerWidth < 700);
      document.documentElement.style.setProperty("--keyboard-inset", `${Math.max(0, keyboard)}px`);
      document.documentElement.style.setProperty("--visual-height", `${vv.height}px`);
      document.documentElement.style.setProperty("--visual-top", `${vv.offsetTop}px`);
    };
    vv.addEventListener("resize", update); vv.addEventListener("scroll", update); update();
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); document.documentElement.style.removeProperty("--keyboard-inset"); document.documentElement.style.removeProperty("--visual-height"); document.documentElement.style.removeProperty("--visual-top"); };
  }, []);

  function newChat() { setMessages([]); setConversationId(undefined); setMessage(""); setDrawer(false); setAuthMode(null); }
  async function openChat(chat: ChatMeta) {
    setBusy(true); setMessage(""); setDrawer(false);
    try {
      const getChat = httpsCallable<{ conversationId: string }, { messages: Message[] }>(functions, "getConversation");
      const result = await getChat({ conversationId: chat.id });
      setMessages(result.data.messages); setConversationId(chat.id); setAuthMode(null);
    } catch { setMessage("That conversation couldn’t be opened. Please try again."); }
    finally { setBusy(false); }
  }
  async function deleteChat(id: string) {
    try { await removeChat({ conversationId: id }); if (conversationId === id) newChat(); }
    catch { setMessage("We couldn’t delete that conversation. Try again."); }
  }
  async function send(text = input) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const next = [...messages, { role: "user" as const, content: prompt }];
    setMessages(next); setInput(""); setBusy(true); setMessage("");
    let answer = "";
    try {
      const result = await ask.stream({ message: prompt, ...(user && conversationId ? { conversationId } : {}) });
      for await (const chunk of result.stream) {
        answer += chunk.text ?? "";
        setMessages([...next, { role: "assistant", content: answer }]);
      }
      const final = await result.data;
      if (!answer) answer = final.text;
      setMessages([...next, { role: "assistant", content: answer, ...(final.card ? { card: final.card } : {}) }]);
      if (final.conversationId) setConversationId(final.conversationId);
    } catch (error) {
      setMessages(next);
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      setMessage(code.includes("resource-exhausted") ? "That’s a lot of questions for now. Please try again later." : "Razzberry’s guide is temporarily unavailable. Your question is still here—please try again.");
    } finally { setBusy(false); }
  }
  async function submitAuth(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (authMode === "reset") {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage("If an account exists for that email, a reset link is on its way.");
      } else {
        const credential = authMode === "signup"
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
        const completeTurns = messages.slice(0, messages.length - messages.length % 2).slice(-20);
        if (completeTurns.length) {
          const adopted = await transfer({ messages: completeTurns, ...(conversationId ? { conversationId } : {}) });
          setConversationId(adopted.data.conversationId);
        }
        setAuthMode(null); setPassword(""); setMessage(`You’re signed in as ${credential.user.email}.`);
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      setMessage(code.includes("email-already-in-use") ? "That email already has an account. Try signing in." : code.includes("invalid-credential") ? "Email or password didn’t match. Try again." : "We couldn’t complete that request. Please check your details and try again.");
    } finally { setBusy(false); }
  }
  async function submitPrompt(event: FormEvent) { event.preventDefault(); await send(); }

  const showWelcome = messages.length === 0;
  const sidebar = <aside className={`chat-sidebar ${drawer ? "drawer-open" : ""}`}>
    <div className="chat-sidebar-head"><Brand compact /><button className="icon-button close-drawer" onClick={() => setDrawer(false)} aria-label="Close history"><X size={18} /></button></div>
    <button className="new-chat-button" onClick={newChat}><MessageSquarePlus size={16} /> New chat <Plus size={16} /></button>
    <div className="history-heading">YOUR CHATS</div>
    <div className="history-list">{chatList.map((chat) => <div className={`history-item ${conversationId === chat.id ? "active" : ""}`} key={chat.id}><button onClick={() => void openChat(chat)}>{chat.title || "Razzberry conversation"}</button><button aria-label="Delete conversation" onClick={() => void deleteChat(chat.id)}><Trash2 size={14} /></button></div>)}</div>
    <div className="sidebar-bottom">{user ? <><div className="sidebar-user"><span>{user.email?.[0]?.toUpperCase() ?? "R"}</span><small>{user.email}</small></div><button className="sidebar-signin" onClick={() => void signOut(auth).then(() => { setConversationId(undefined); setAuthMode(null); })}>Sign out</button></> : <button className="sidebar-signin" onClick={() => setAuthMode("signin")}>Sign in to save chats</button>}</div>
  </aside>;
  const cardProps = {
    user: user ?? null, mode: authMode, setMode: setAuthMode, email, setEmail, password, setPassword, busy,
    onSubmit: (event: FormEvent) => void submitAuth(event),
    onSignOut: () => { void signOut(auth).then(() => { setConversationId(undefined); setAuthMode(null); }); },
  };
  const title = authMode === "signup" ? "Create your account" : authMode === "signin" ? "Sign in to Razzberry" : "Reset your password";

  return <main className={`chat-app ${mobileKeyboard ? "keyboard-open" : ""}`}>
    {sidebar}{drawer && <button className="drawer-scrim" aria-label="Close history" onClick={() => setDrawer(false)} />}
    <section className="chat-main">
      <header className="chat-topbar"><button className="icon-button mobile-history" aria-label="Open history" onClick={() => setDrawer(true)}><Menu size={19} /></button><Brand compact /><div className="chat-top-actions"><span className="guide-label"><i /> RAZZBERRY GUIDE</span>{user ? <span className="signed-in-label">{user.email}</span> : <button onClick={() => setAuthMode("signin")}>Sign in</button>}</div></header>
      <div className={`conversation-scroll ${showWelcome ? "welcome-scroll" : ""}`} ref={scrollRef}>
        {showWelcome ? <div className="welcome-content"><div className="welcome-symbol"><span>R</span><i /><i /><i /></div><span className="eyebrow"><span className="live-dot" /> A CLEARER WAY TO TALK ABOUT CREATIVE RIGHTS</span><h1>What would you like<br />to <em>understand?</em></h1><p>I’m Razzberry’s guide. Ask about the idea, the problem it explores, or what might come next.</p><div className="suggestion-grid">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => void send(suggestion)}><span>{suggestion}</span><ArrowDown size={15} /></button>)}</div>{authMode && !user && <div className="inline-auth-card route-auth-card"><div className="inline-auth-copy"><strong>{title}</strong><span>{authMode === "reset" ? "Enter your email and we’ll send a reset link." : "Use your email to continue to Razzberry."}</span></div><form className="inline-auth-form" onSubmit={(event) => void submitAuth(event)}><label htmlFor="chat-email">Email</label><input id="chat-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />{authMode !== "reset" && <><label htmlFor="chat-password">Password</label><input id="chat-password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required minLength={authMode === "signup" ? 8 : undefined} placeholder={authMode === "signup" ? "At least 8 characters" : "Your password"} value={password} onChange={(event) => setPassword(event.target.value)} /></>}<button className="button" disabled={busy}>{authMode === "signup" ? "Create account" : authMode === "reset" ? "Send reset link" : "Sign in"}</button><div className="inline-auth-switch"><button type="button" onClick={() => setAuthMode("signin")}>Sign in</button><button type="button" onClick={() => setAuthMode("signup")}>Sign up</button><button type="button" onClick={() => setAuthMode("reset")}>Forgot password?</button></div></form></div>}</div> : <div className="message-list">{messages.map((item, index) => <article className={`chat-message ${item.role}`} key={`${index}-${item.role}`}><div className="message-avatar">{item.role === "assistant" ? <span>R</span> : user?.email?.[0]?.toUpperCase() || "Y"}</div><div className="message-body"><div className="message-author">{item.role === "assistant" ? "Razzberry" : "You"}</div><div className="message-content">{item.content}</div></div></article>)}
          {!user && messages.some((item) => item.role === "assistant") && <div className="inline-auth-card"><div className="auth-card-icon"><CircleHelp size={17} /></div><div className="inline-auth-copy"><strong>Keep this conversation</strong><span>Create a free account to save your chats and pick up where you left off.</span></div>{authMode ? <form className="inline-auth-form" onSubmit={(event) => void submitAuth(event)}><label htmlFor="chat-email">Email</label><input id="chat-email" type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />{authMode !== "reset" && <><label htmlFor="chat-password">Password</label><input id="chat-password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required minLength={authMode === "signup" ? 8 : undefined} placeholder={authMode === "signup" ? "At least 8 characters" : "Your password"} value={password} onChange={(event) => setPassword(event.target.value)} /></>}<button className="button" disabled={busy}>{authMode === "signup" ? "Create account" : authMode === "reset" ? "Send reset link" : "Sign in"}</button><div className="inline-auth-switch">{authMode !== "signin" && <button type="button" onClick={() => setAuthMode("signin")}>Sign in</button>}{authMode !== "signup" && <button type="button" onClick={() => setAuthMode("signup")}>Sign up</button>}{authMode !== "reset" && <button type="button" onClick={() => setAuthMode("reset")}>Forgot password?</button>}</div></form> : <><label className="inline-email-label" htmlFor="inline-email">Your email</label><input id="inline-email" className="inline-email" type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} /><div className="inline-auth-actions"><button onClick={() => setAuthMode("signin")}>Sign in</button><button className="button" onClick={() => setAuthMode("signup")}>Sign up</button></div></>}</div>}
        </div>}
        {user && messages.at(-1)?.card === "account-access" && <ChatCardRenderer type="account-access" {...cardProps} />}
        {busy && <div className="typing-status"><span /><span /><span /> Razzberry is thinking</div>}
        {message && <div className="chat-notice" role="status">{message}</div>}
      </div>
      <div className="composer-dock"><form className="chat-composer" onSubmit={(event) => void submitPrompt(event)}><textarea ref={textareaRef} rows={1} value={input} onChange={(event) => setInput(event.target.value)} onFocus={() => setMobileKeyboard(true)} onBlur={() => setMobileKeyboard(false)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Razzberry anything…" aria-label="Message Razzberry" maxLength={1500} /><button aria-label="Send message" disabled={!input.trim() || busy}><ArrowUp size={18} /></button></form><div className="composer-foot"><span>Razzberry answers questions about its early ideas—not general questions.</span><Link to="/">About Razzberry</Link></div></div>
    </section>
  </main>;
}

function modeFromPath(path: string): AuthMode { return path === "/signup" ? "signup" : path === "/signin" ? "signin" : path === "/forgot-password" ? "reset" : null; }
