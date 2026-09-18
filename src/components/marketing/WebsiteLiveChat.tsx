import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleCheck,
  Headphones,
  Loader2,
  MessageCircle,
  Phone,
  Send,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { userFacingError } from "@/lib/errors/user-facing";

export const OPEN_PUBLIC_LIVE_CHAT_EVENT = "seza-open-public-live-chat";
const CHAT_SESSION_KEY = "seza-public-live-chat-session";
function publicChatError(value: unknown): string {
  return userFacingError(
    value,
    "Live chat is temporarily unavailable. Please call SEZA Support or try again shortly.",
  );
}

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  from: "agent" | "visitor";
  author?: string | null;
};

type StoredSession = {
  token: string;
  ticketId: string;
  ticketNumber?: number;
  visitorName?: string;
};

type ChatState = StoredSession & {
  chatStatus: string;
  messages: ChatMessage[];
};

async function liveChatRequest(payload: Record<string, unknown>) {
  const response = await fetch("/api/public/live-chat", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};

  if (!response.ok) {
    throw new Error(
      publicChatError(
        data && typeof data === "object" && "error" in data
          ? (data as { error?: unknown }).error
          : undefined,
      ),
    );
  }
  return data;
}

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) window.sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(CHAT_SESSION_KEY);
  } catch {
    // The chat remains usable even when browser storage is blocked.
  }
}

export function openWebsiteLiveChat() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_PUBLIC_LIVE_CHAT_EVENT));
}

export function WebsiteLiveChat() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [openingMessage, setOpeningMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [website, setWebsite] = useState("");
  const [chat, setChat] = useState<ChatState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(
    async (session?: StoredSession | null) => {
      const active = session ?? chat;
      if (!active?.token) return;
      try {
        const data = await liveChatRequest({ action: "poll", token: active.token });
        setChat({
          token: active.token,
          ticketId: data.ticketId,
          ticketNumber: data.ticketNumber,
          visitorName: data.visitorName || active.visitorName,
          chatStatus: data.chatStatus,
          messages: data.messages || [],
        });
      } catch (pollError: any) {
        if (String(pollError?.message).includes("not found")) saveSession(null);
      }
    },
    [chat],
  );

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      const session = readSession();
      if (session) void poll(session);
    };
    window.addEventListener(OPEN_PUBLIC_LIVE_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PUBLIC_LIVE_CHAT_EVENT, onOpen);
  }, [poll]);

  useEffect(() => {
    const session = readSession();
    if (session) void poll(session);
    // Resume once on mount only.
  }, []);

  useEffect(() => {
    if (!chat?.token || chat.chatStatus === "ended") return;
    const timer = window.setInterval(() => void poll(), open ? 3500 : 8000);
    return () => window.clearInterval(timer);
  }, [chat?.token, chat?.chatStatus, open, poll]);

  useEffect(() => {
    if (!open) return;
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [open, chat?.messages.length]);

  const isEnded = chat?.chatStatus === "ended";
  const agentJoined = useMemo(
    () => Boolean(chat?.messages.some((message) => message.from === "agent")),
    [chat?.messages],
  );

  async function startChat() {
    setError("");
    setBusy(true);
    try {
      const data = await liveChatRequest({
        action: "start",
        name,
        phone,
        message: openingMessage,
        website,
      });
      const session: StoredSession = {
        token: data.token,
        ticketId: data.ticketId,
        ticketNumber: data.ticketNumber,
        visitorName: data.visitorName || name,
      };
      saveSession(session);
      setChat({ ...session, chatStatus: data.chatStatus, messages: data.messages || [] });
      setOpeningMessage("");
    } catch (startError: any) {
      setError(publicChatError(startError));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!chat?.token || !draft.trim() || isEnded) return;
    setError("");
    setBusy(true);
    const message = draft.trim();
    setDraft("");
    try {
      const data = await liveChatRequest({ action: "send", token: chat.token, message });
      setChat((current) =>
        current ? { ...current, messages: data.messages || current.messages } : current,
      );
    } catch (sendError: any) {
      setDraft(message);
      setError(publicChatError(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function endChat() {
    if (!chat?.token || isEnded) return;
    if (!window.confirm("End this live chat? The conversation will stay saved for SEZA Support."))
      return;
    setBusy(true);
    try {
      await liveChatRequest({ action: "end", token: chat.token });
      setChat((current) => (current ? { ...current, chatStatus: "ended" } : current));
      saveSession(null);
    } catch (endError: any) {
      setError(publicChatError(endError));
    } finally {
      setBusy(false);
    }
  }

  function startAnotherChat() {
    saveSession(null);
    setChat(null);
    setDraft("");
    setOpeningMessage("");
    setError("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          const session = readSession();
          if (session) void poll(session);
        }}
        className="fixed bottom-20 right-4 z-[75] grid size-14 place-items-center rounded-full border border-blue-600 bg-blue-700 text-white shadow-[0_18px_45px_-16px_rgba(30,64,175,0.85)] transition-all hover:-translate-y-0.5 hover:bg-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        aria-label={chat && !isEnded ? "Reopen SEZA live chat" : "Open SEZA live chat"}
        title={chat && !isEnded ? "Reopen live chat" : "Live chat"}
      >
        <Headphones className="size-6" />
        {chat && !isEnded && (
          <span className="absolute right-0 top-0 size-3 rounded-full border-2 border-white bg-emerald-400" aria-hidden="true" />
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="SEZA live chat"
    >
      <section className="flex h-[min(720px,92dvh)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-blue-200 bg-white shadow-2xl dark:border-blue-400/20 dark:bg-slate-950">
        <header className="flex items-start justify-between gap-4 border-b border-blue-800 bg-blue-800 px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-blue-800">
              <Headphones className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="font-black">SEZA Live Chat</div>
              <div className="truncate text-xs text-blue-100">
                {chat
                  ? isEnded
                    ? "Chat ended"
                    : agentJoined
                      ? "Connected with support"
                      : "Waiting for an agent"
                  : "Name and phone are required before connecting"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-white/25 text-white hover:bg-white/10"
            aria-label="Close live chat"
          >
            <X className="size-4" />
          </button>
        </header>

        {!chat ? (
          <div className="flex-1 overflow-y-auto p-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-400/15 dark:bg-blue-500/10 dark:text-blue-100">
              Tell us who you are and what you need. Your name, phone number, and conversation are
              shared only with the SEZA support team.
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="seza-chat-name">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="seza-chat-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="pl-9"
                    autoComplete="name"
                    placeholder="Your name"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seza-chat-phone">Phone number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="seza-chat-phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="pl-9"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>
              <div className="hidden" aria-hidden="true">
                <Label htmlFor="seza-chat-website">Website</Label>
                <Input
                  id="seza-chat-website"
                  tabIndex={-1}
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seza-chat-message">How can we help?</Label>
                <Textarea
                  id="seza-chat-message"
                  value={openingMessage}
                  onChange={(event) => setOpeningMessage(event.target.value)}
                  rows={5}
                  placeholder="Tell us about setup, pricing, hardware, your account, or a POS issue."
                />
              </div>
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button
                className="h-12 w-full rounded-full bg-blue-700 font-bold text-white hover:bg-blue-800"
                disabled={busy}
                onClick={startChat}
              >
                {busy ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <MessageCircle className="mr-2 size-4" />
                )}
                Connect with an agent
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-blue-100 bg-blue-50 px-5 py-3 text-xs text-blue-900 dark:border-blue-400/15 dark:bg-blue-500/10 dark:text-blue-100">
              <div className="flex items-center justify-between gap-3">
                <span>
                  Chat #{chat.ticketNumber ?? "Pending"} | {chat.visitorName}
                </span>
                {!isEnded && (
                  <button
                    type="button"
                    onClick={endChat}
                    disabled={busy}
                    className="font-bold text-blue-800 underline underline-offset-2 dark:text-blue-200"
                  >
                    End chat
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
              {!agentJoined && !isEnded && (
                <div className="rounded-2xl border border-blue-200 bg-white p-3 text-sm text-blue-950 dark:border-blue-400/20 dark:bg-slate-900 dark:text-blue-100">
                  <div className="flex items-center gap-2 font-semibold">
                    <Loader2 className="size-4 animate-spin" /> Waiting for a SEZA agent
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can keep this window open or come back during this browser session.
                  </p>
                </div>
              )}
              {chat.messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.from === "visitor" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[86%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                      message.from === "visitor"
                        ? "bg-blue-700 text-white"
                        : "border border-blue-100 bg-white text-slate-950 dark:border-blue-400/15 dark:bg-slate-900 dark:text-white",
                    )}
                  >
                    <div
                      className={cn(
                        "mb-1 text-[10px]",
                        message.from === "visitor" ? "text-blue-100" : "text-muted-foreground",
                      )}
                    >
                      {message.from === "visitor" ? "You" : message.author || "SEZA Support"} ·{" "}
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="whitespace-pre-wrap">{message.body}</div>
                  </div>
                </div>
              ))}
              {isEnded && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100">
                  <div className="flex items-center gap-2 font-bold">
                    <CircleCheck className="size-4" /> This chat has ended
                  </div>
                  <p className="mt-1 text-xs">The transcript remains saved with SEZA Support.</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={startAnotherChat}>
                    Start another chat
                  </Button>
                </div>
              )}
              <div ref={messageEndRef} />
            </div>
            {!isEnded && (
              <footer className="border-t bg-white p-3 dark:bg-slate-950">
                {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={2}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Write a message"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    className="size-11 shrink-0 rounded-full bg-blue-700 hover:bg-blue-800"
                    onClick={sendMessage}
                    disabled={busy || !draft.trim()}
                    aria-label="Send message"
                  >
                    {busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </footer>
            )}
          </>
        )}
      </section>
    </div>
  );
}
