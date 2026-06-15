/**
 * Workaround for supabase-js v2 ES256 JWT bug.
 * Reads the auth token directly from localStorage without calling jose.jwtVerify.
 * Definitive fix: change JWT Algorithm to HS256 in
 *   Supabase Dashboard → Authentication → Settings → JWT Settings.
 */
export function getSessionDirect(): { accessToken: string; userId: string } | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token ?? parsed?.session?.access_token;
        if (!token) continue;
        const part   = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        if (!payload?.sub) continue;
        return { accessToken: token, userId: payload.sub };
      }
    }
  } catch {}
  return null;
}

export function getAccessTokenDirect(): string | null {
  return getSessionDirect()?.accessToken ?? null;
}
