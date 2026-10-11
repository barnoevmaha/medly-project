import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * What the assistant knows about where you are.
 *
 * A page registers its context on mount and clears it on unmount, so the
 * floating assistant is aware of the article, challenge or resource in front
 * of you without any page having to own a button or a panel.
 *
 * Only `kind` and `key` travel far: the server resolves the real content from
 * its own database, so the client cannot inflate the prompt or invent source
 * material. `note` is the small amount of state only the client knows — which
 * question is on screen, what the student picked — and the server caps it.
 */
export type AiContextKind = "article" | "resource" | "challenge";

export interface AiContext {
  kind: AiContextKind;
  /** Slug the server looks up. */
  key: string;
  /** Shown to the user in the panel, so the context is never invisible. */
  label: string;
  /** Transient on-screen state. Kept short; the server truncates it anyway. */
  note?: string;
}

interface AiContextValue {
  context: AiContext | null;
  setContext: (next: AiContext | null) => void;
}

const Ctx = createContext<AiContextValue>({ context: null, setContext: () => {} });

export function AiContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AiContext | null>(null);
  const value = useMemo(() => ({ context, setContext }), [context]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAiContext() {
  return useContext(Ctx);
}

/**
 * Register page context for as long as this component is mounted.
 *
 * Pass `null` while the page is still loading — the context appears once there
 * is something real to describe, and disappears when you navigate away.
 */
export function useProvideAiContext(next: AiContext | null) {
  const { setContext } = useAiContext();
  // Comparing the serialised value keeps a new object literal on every render
  // from re-setting state in a loop.
  const serialised = next ? JSON.stringify(next) : null;
  const latest = useRef(next);
  latest.current = next;

  useEffect(() => {
    setContext(latest.current);
    return () => setContext(null);
  }, [serialised, setContext]);
}
