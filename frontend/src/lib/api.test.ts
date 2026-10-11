/* Session refresh in the API client: a 401 refreshes once and replays. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, getToken, refreshSession, setToken } from "./api";

const BASE = "http://localhost:8000";
const REFRESH = `${BASE}/api/auth/refresh`;

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;
let assign: ReturnType<typeof vi.fn<(url: string) => void>>;

function route(handler: Handler) {
  fetchMock.mockImplementation(async (url, init) => handler(String(url), init));
}

const calls = (url: string) => fetchMock.mock.calls.filter(([called]) => called === url);
const authHeader = (init: RequestInit) => new Headers(init.headers).get("Authorization");

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  assign = vi.fn();
  vi.stubGlobal("window", { location: { pathname: "/dashboard", assign } });
  // No Web Locks unless a test installs them (Node has its own).
  vi.stubGlobal("navigator", {});
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("401 handling", () => {
  it("refreshes and replays the request with the new token", async () => {
    setToken("expired");
    route((url, init) => {
      if (url === REFRESH) return json(200, { access_token: "fresh" });
      return authHeader(init) === "Bearer fresh" ? json(200, { id: 1 }) : json(401);
    });

    await expect(api.me()).resolves.toEqual({ id: 1 });
    expect(getToken()).toBe("fresh");
    expect(calls(REFRESH)).toHaveLength(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends the refresh request with the cookie and the CSRF header", async () => {
    setToken("expired");
    route((url) => (url === REFRESH ? json(200, { access_token: "fresh" }) : json(401)));
    await api.me().catch(() => undefined);

    const [, init] = calls(REFRESH)[0];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-Medly-CSRF")).toBe("1");
  });

  it("shares one refresh between concurrent requests", async () => {
    setToken("expired");
    route((url, init) => {
      if (url === REFRESH) return json(200, { access_token: "fresh" });
      return authHeader(init) === "Bearer fresh" ? json(200, { ok: true }) : json(401);
    });

    await Promise.all([api.me(), api.me(), api.me()]);
    expect(calls(REFRESH)).toHaveLength(1);
  });

  it("ends the session when the refresh is refused", async () => {
    setToken("expired");
    route(() => json(401));

    const error = await api.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect(getToken()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
    expect(calls(`${BASE}/api/auth/me`)).toHaveLength(1);
  });

  it("does not loop when the replayed request is rejected too", async () => {
    setToken("expired");
    let refreshes = 0;
    route((url) => {
      if (url === REFRESH) return json(200, { access_token: `fresh-${++refreshes}` });
      return json(401);
    });

    await expect(api.me()).rejects.toBeInstanceOf(ApiError);
    expect(refreshes).toBe(1);
    expect(calls(`${BASE}/api/auth/me`)).toHaveLength(2);
    expect(getToken()).toBeNull();
  });

  it("does not refresh for a 401 from the auth endpoints themselves", async () => {
    route(() => json(401, { detail: "nope" }));
    await expect(
      api.register({ email: "a@b.c", password: "12345678", full_name: "A" })
    ).rejects.toBeInstanceOf(ApiError);
    expect(calls(REFRESH)).toHaveLength(0);
  });

  it("does not redirect from a public page", async () => {
    vi.stubGlobal("window", { location: { pathname: "/login", assign } });
    setToken("expired");
    route(() => json(401));
    await api.me().catch(() => undefined);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("refreshSession", () => {
  it("uses a token another tab already refreshed instead of spending the cookie", async () => {
    setToken("refreshed-by-another-tab");
    route(() => json(200, { access_token: "should-not-be-used" }));

    await expect(refreshSession("expired")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getToken()).toBe("refreshed-by-another-tab");
  });

  it("serialises refreshes across tabs with a Web Lock", async () => {
    const request = vi.fn((_name: string, task: () => Promise<boolean>) => task());
    vi.stubGlobal("navigator", { locks: { request } });
    setToken("expired");
    route(() => json(200, { access_token: "fresh" }));

    await expect(refreshSession("expired")).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith("medly.refresh", expect.any(Function));
    expect(getToken()).toBe("fresh");
  });

  it("refreshes again the next time the token expires", async () => {
    setToken("expired-1");
    let issued = 0;
    route(() => json(200, { access_token: `fresh-${++issued}` }));

    await refreshSession("expired-1");
    setToken("expired-2");
    await refreshSession("expired-2");
    expect(calls(REFRESH)).toHaveLength(2);
    expect(getToken()).toBe("fresh-2");
  });

  it("reports failure when the network is down", async () => {
    setToken("expired");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(refreshSession("expired")).resolves.toBe(false);
  });
});

describe("credentials", () => {
  it("sends credentials on ordinary requests and on login", async () => {
    setToken("valid");
    route((url) =>
      url.endsWith("/api/auth/login") ? json(200, { access_token: "t" }) : json(200, {})
    );
    await api.me();
    await api.login("a@b.c", "secret");
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.credentials).toBe("include");
    }
  });
});

describe("logout", () => {
  it("revokes the session on the server and forgets the token", async () => {
    setToken("valid");
    route(() => new Response(null, { status: 204 }));

    await api.logout();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/auth/logout`);
    expect(init.credentials).toBe("include");
    expect(new Headers(init.headers).get("X-Medly-CSRF")).toBe("1");
    expect(getToken()).toBeNull();
  });

  it("still signs out locally when offline", async () => {
    setToken("valid");
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await api.logout();
    expect(getToken()).toBeNull();
  });
});

describe("streaming chat", () => {
  it("refreshes and reopens the stream after a 401", async () => {
    setToken("expired");
    const stream = `${BASE}/api/assistant/chat/stream`;
    route((url, init) => {
      if (url === REFRESH) return json(200, { access_token: "fresh" });
      if (url === stream && authHeader(init) === "Bearer fresh") {
        return new Response(
          'data: {"type":"done","session_id":"s","blocked":false,"risk_level":"low","disclaimer":"d"}\n\n',
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        );
      }
      return json(401);
    });

    const onError = vi.fn();
    await api.chatStream("hello", {}, { onChunk: vi.fn(), onDone: vi.fn(), onError });
    expect(calls(stream)).toHaveLength(2);
    expect(calls(REFRESH)).toHaveLength(1);
    expect(assign).not.toHaveBeenCalled();
  });
});
