import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check, Copy, FileText, Info, RotateCcw, Send, ShieldAlert,
  Sparkles, Square, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { StreamingAnswer } from "@/components/assistant/StreamingAnswer";
import { AssistantAvatar } from "@/components/assistant/AssistantAvatar";
import { useAiContext } from "@/lib/ai-context";
import { readPreferences } from "@/lib/preferences";
import { api, ApiError, traceStream, type QuickAction, type RiskLevel } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Medly AI — the fixed-corner assistant.
   One entry point, everywhere in the app. It knows what page you are on: the
   article, challenge or library item you have open registers itself through
   `useProvideAiContext`, and the server resolves the real content from its own
   rows. Answers stream in over SSE as Gemini writes them. Every reply arrives
   already carrying its disclaimer from the server — the client cannot strip
   it, and a refusal renders differently on purpose. */

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  blocked?: boolean;
  riskLevel?: RiskLevel;
  /** True while fragments are still arriving into this message. */
  streaming?: boolean;
  /** Stopped by the user, or cut short by an error, with text already shown. */
  interrupted?: boolean;
  /** Set when generation failed. Shown under whatever text survived. */
  error?: string;
  /** What produced this answer, so Retry can resend exactly that. */
  source?: { text?: string; action?: QuickAction };
}

let nextId = 1;

const GREETING: Message = {
  id: 0,
  role: "assistant",
  content:
    "I'm Medly AI, your medical learning assistant. Ask me to explain a mechanism, " +
    "compare two conditions, walk through a drug class, or quiz you before an exam.\n\n" +
    "I explain for learning — I don't diagnose, prescribe, or accept patient identifiers.",
};

const FOLLOW_UPS: Array<{ action: QuickAction; label: string }> = [
  { action: "simpler", label: "Simpler" },
  { action: "deeper", label: "Deeper" },
  { action: "example", label: "Example" },
  { action: "mcq", label: "MCQs" },
  { action: "case", label: "Case" },
  { action: "quiz", label: "Quiz me" },
];

/* Reveal pacing. One frame is ~16ms, so a backlog of one character per
   frame is ~16ms/char — the low end of a comfortable typing speed. The
   divisors keep a bigger backlog from falling behind: whatever is queued
   clears in roughly this many frames, so long answers speed up instead of
   taking half a minute. */
const DRAIN_FRAMES = 36;          // while still receiving
const FINISH_FRAMES = 44;         // after the stream ends — gentler, not a dump
const MAX_CHARS_PER_FRAME = 9;    // ceiling: about a word, never a paragraph
/* Measured against real traffic (1800 chars arriving as 9 chunks over 740ms):
   ~4.7s to reveal, averaging 6.4 characters a frame. The cap is what governs
   a long answer — raise it to 10 if the tail of a 6000-character reply feels
   slow, lower it for a more deliberate crawl. */
/** Distance from the bottom that still counts as "following along". */
const STICK_PX = 80;

function riskChip(risk: RiskLevel) {
  const map: Record<RiskLevel, string> = {
    none: "bg-muted text-muted-foreground",
    low: "bg-success/10 text-success",
    medium: "bg-warning/10 text-warning",
    high: "bg-destructive/10 text-destructive",
  };
  return map[risk];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — the button simply does not confirm */
        }
      }}
      aria-label={copied ? "Copied" : "Copy answer"}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  /** True from send until the first fragment lands — the three dots. */
  const [waiting, setWaiting] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /* Everything received so far, and how much of it has been shown. The
     panel renders receivedRef.slice(0, revealedRef); a rAF loop closes the
     gap. Refs rather than state so a fragment arriving mid-frame does not
     schedule a render of its own. */
  const receivedRef = useRef("");
  const revealedRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const streamDoneRef = useRef(false);
  const finalPatchRef = useRef<Partial<Message> | null>(null);
  // False as soon as the user scrolls up mid-generation; true again when they
  // come back to the bottom.
  const stickToBottom = useRef(true);

  const { context } = useAiContext();

  useEffect(() => {
    if (!open || suggestions.length) return;
    api.suggestions().then(setSuggestions).catch(() => setSuggestions([]));
  }, [open, suggestions.length]);

  // Auto-scroll, but only while the user is actually at the bottom. Scrolling
  // up during generation is a deliberate act and must not be undone.
  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node || !stickToBottom.current) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    stickToBottom.current =
      node.scrollHeight - node.scrollTop - node.clientHeight <= STICK_PX;
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages, waiting, scrollToBottom]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Nothing may outlive the component: abort the request, drop the timer.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const send = useCallback(
    async (payload: { text?: string; action?: QuickAction }) => {
      const question = payload.text?.trim();
      if (busy || (!question && !payload.action)) return;

      const answerId = nextId++;
      const controller = new AbortController();
      abortRef.current = controller;
      receivedRef.current = "";
      revealedRef.current = 0;
      streamDoneRef.current = false;
      finalPatchRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      stickToBottom.current = true;

      setMessages((prev) => [
        ...prev,
        ...(question
          ? [{ id: nextId++, role: "user" as const, content: question }]
          : []),
        { id: answerId, role: "assistant", content: "", streaming: true, source: payload },
      ]);
      if (question) setInput("");
      setBusy(true);
      setWaiting(true);

      const applyToAnswer = (patch: Partial<Message>) =>
        setMessages((prev) =>
          prev.map((m) => (m.id === answerId ? { ...m, ...patch } : m))
        );

      /* ---- reveal ------------------------------------------------------
         Received text lands in `receivedRef` the instant it arrives; the
         panel shows `receivedRef.slice(0, revealedRef)`. A rAF loop walks
         the second number toward the first, so the reader sees characters
         appear rather than paragraphs.

         This never runs ahead of the network: the loop can only reveal text
         that has already arrived, so a pause in the stream is a pause on
         screen. The pace adapts to the backlog because a fixed 16ms/char
         would need half a minute for a long answer — at a small backlog it
         is one character per frame, and it speeds up rather than falling
         behind. Reduced-motion users get the text immediately. */
      const instant = readPreferences().reduceMotion;

      const paint = () => {
        const shown = receivedRef.current.slice(0, revealedRef.current);
        setMessages((prev) =>
          prev.map((m) => (m.id === answerId ? { ...m, content: shown } : m))
        );
      };

      const revealAll = () => {
        revealedRef.current = receivedRef.current.length;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        paint();
      };

      const pump = () => {
        rafRef.current = null;
        const total = receivedRef.current.length;
        const shown = revealedRef.current;

        if (shown < total) {
          const backlog = total - shown;
          const step = Math.min(
            MAX_CHARS_PER_FRAME,
            Math.max(
              1,
              Math.ceil(backlog / (streamDoneRef.current ? FINISH_FRAMES : DRAIN_FRAMES))
            )
          );
          revealedRef.current = Math.min(total, shown + step);
          traceStream("React flush", `revealed=${revealedRef.current}/${total} step=${step}`);
          paint();
        }

        if (revealedRef.current < receivedRef.current.length || !streamDoneRef.current) {
          rafRef.current = requestAnimationFrame(pump);
        } else if (finalPatchRef.current) {
          // Everything received has been shown — only now does the caret go.
          applyToAnswer(finalPatchRef.current);
          finalPatchRef.current = null;
        }
      };

      const ensurePump = () => {
        if (instant) {
          revealAll();
          if (streamDoneRef.current && finalPatchRef.current) {
            applyToAnswer(finalPatchRef.current);
            finalPatchRef.current = null;
          }
          return;
        }
        if (rafRef.current === null) rafRef.current = requestAnimationFrame(pump);
      };

      try {
        await api.chatStream(
          question ?? "",
          {
            sessionId,
            action: payload.action,
            contextKind: context?.kind,
            contextKey: context?.key,
            contextNote: context?.note,
          },
          {
            onStart: (id) => {
              if (id) setSessionId(id);
            },
            onChunk: (text) => {
              setWaiting(false);
              receivedRef.current += text;
              traceStream(
                "text appended",
                `chars=${text.length} received=${receivedRef.current.length} ` +
                  `revealed=${revealedRef.current}`
              );
              ensurePump();
            },
            onDone: (meta) => {
              if (meta.session_id) setSessionId(meta.session_id);
              // The stream is over, but text may still be queued. The patch
              // is held until the reveal catches up, so the caret does not
              // vanish while characters are still appearing.
              streamDoneRef.current = true;
              finalPatchRef.current = {
                streaming: false,
                blocked: meta.blocked,
                riskLevel: meta.risk_level,
              };
              ensurePump();
            },
            onError: (detail, partial) => {
              // An error stops the pacing: whatever arrived is shown at once.
              streamDoneRef.current = true;
              revealAll();
              applyToAnswer(
                partial
                  ? { streaming: false, interrupted: true, error: detail }
                  : { streaming: false, content: detail, error: undefined }
              );
              finalPatchRef.current = null;
            },
          },
          controller.signal
        );
      } catch (error) {
        streamDoneRef.current = true;
        // Stop, or a failure: no reason to keep pacing text the user already
        // owns, so reveal the backlog immediately.
        revealAll();
        finalPatchRef.current = null;
        if (controller.signal.aborted) {
          applyToAnswer({ streaming: false, interrupted: true });
        } else {
          const detail =
            error instanceof ApiError && error.message
              ? error.message
              : "Could not reach Medly AI. Check your connection and try again.";
          setMessages((prev) =>
            prev.map((m) =>
              m.id === answerId
                ? m.content
                  ? { ...m, streaming: false, interrupted: true, error: detail }
                  : { ...m, streaming: false, content: detail }
                : m
            )
          );
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        setWaiting(false);
        inputRef.current?.focus();
      }
    },
    [busy, sessionId, context]
  );

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    abortRef.current?.abort();
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setMessages([GREETING]);
    setSessionId(undefined);
    setInput("");
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter breaks the line.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send({ text: input });
    }
  }

  const started = messages.length > 1;

  return (
    <>
      {/* launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Medly AI" : "Open Medly AI"}
        aria-expanded={open}
        className={cn(
          // No plate behind the character — it reads as itself rather than as a
          // glyph inside a teal button. The box keeps its corner and position so
          // the focus ring and the hit target are unchanged in shape, and grows
          // from 56 to 64px because the character now has to carry the button on
          // its own.
          "group fixed bottom-24 right-4 z-[60] flex h-16 w-16 items-center justify-center rounded-2xl",
          "transition-transform duration-200 hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
          "md:bottom-6 md:right-6"
        )}
      >
        {open ? (
          // The close glyph does need a plate: without one it is a dark X over
          // whatever the page — or the mobile scrim — happens to be.
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-soft">
            <X className="h-5 w-5" />
          </span>
        ) : (
          <AssistantAvatar className="h-auto w-14 transition-transform duration-200 group-hover:-translate-y-0.5" />
        )}
        {!open && context && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card shadow-soft"
            aria-hidden="true"
          >
            <Sparkles className="h-2.5 w-2.5 text-primary" />
          </span>
        )}
      </button>

      {/* scrim, small screens only */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-[55] bg-black/40 transition-opacity duration-200 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* panel */}
      <div
        role="dialog"
        aria-label="Medly AI"
        className={cn(
          "fixed bottom-44 right-4 z-[60] flex w-[calc(100vw-2rem)] max-w-md flex-col",
          "overflow-hidden rounded-2xl border border-border bg-card shadow-medium",
          "origin-bottom-right transition-all duration-200 ease-out",
          "md:bottom-24 md:right-6",
          "h-[min(34rem,calc(100vh-16rem))] md:h-[min(38rem,calc(100vh-10rem))]",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-95 opacity-0"
        )}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl gradient-primary">
            <AssistantAvatar className="h-auto w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold">Medly AI</div>
            <div className="truncate text-xs text-muted-foreground">
              Your medical learning assistant
            </div>
          </div>
          {started && (
            <button
              onClick={reset}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              New chat
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close Medly AI"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* What the assistant can see. Never invisible to the user. */}
        {context && (
          <div className="flex items-center gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs">
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="truncate text-muted-foreground">
              Using <span className="font-semibold text-foreground">{context.label}</span> as
              context
            </span>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          role="log"
          aria-live="polite"
        >
          {messages.map((message) => {
            // An assistant message with no text yet is the waiting state; the
            // three dots render in its place rather than beside it.
            const isEmptyStream = message.streaming && !message.content;
            return (
              <div
                key={message.id}
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    message.role === "user"
                      ? "gradient-primary text-primary-foreground"
                      : message.blocked
                        ? "border border-destructive/30 bg-destructive/5"
                        : "bg-muted"
                  )}
                >
                  {message.blocked && (
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      Blocked by safety rules
                    </div>
                  )}

                  {message.role === "user" ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : isEmptyStream ? (
                    <span className="flex gap-1 py-1" aria-label="Medly AI is thinking">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    </span>
                  ) : message.id === 0 ? (
                    <Markdown>{message.content}</Markdown>
                  ) : (
                    <StreamingAnswer
                      text={message.content}
                      streaming={Boolean(message.streaming)}
                    />
                  )}

                  {/* Interruption and error notes sit under the surviving text. */}
                  {message.role === "assistant" && !message.streaming && message.error && (
                    <p className="mt-2 border-t border-border/60 pt-2 text-xs text-destructive">
                      {message.error}
                    </p>
                  )}
                  {message.role === "assistant" &&
                    !message.streaming &&
                    message.interrupted &&
                    !message.error && (
                      <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                        Generation stopped.
                      </p>
                    )}

                  {message.role === "assistant" &&
                    !message.streaming &&
                    !message.blocked &&
                    message.id !== 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-border/60 pt-1.5">
                        {message.content && <CopyButton text={message.content} />}
                        <button
                          type="button"
                          onClick={() => void send(message.source ?? {})}
                          disabled={busy || !message.source}
                          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                        {message.riskLevel && (
                          <span
                            className={cn(
                              "ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              riskChip(message.riskLevel)
                            )}
                          >
                            {message.riskLevel} risk
                          </span>
                        )}
                      </div>
                    )}
                </div>
              </div>
            );
          })}

          {!started && suggestions.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Try one of these
              </div>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {started && !busy && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-2 scrollbar-hide">
            {FOLLOW_UPS.map(({ action, label }) => (
              <button
                key={action}
                onClick={() => void send({ action })}
                className="whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({ text: input });
          }}
          className="flex items-end gap-2 border-t border-border p-3"
        >
          <label htmlFor="medly-ai-input" className="sr-only">
            Ask Medly AI
          </label>
          <textarea
            id="medly-ai-input"
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            placeholder={context ? `Ask about ${context.label}…` : "Ask a medical question…"}
            className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
          />
          {busy ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={stop}
              aria-label="Stop generating"
              title="Stop generating"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </>
  );
}
