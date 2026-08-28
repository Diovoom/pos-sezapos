// Thin HTTPS client for the bundled Android shell. Always talks to the
// deployed SEZA backend and attaches the Supabase bearer token.
import { nativeFetch, userSafeNetworkMessage } from "./lib/nativeHttp";
import { API_BASE_URL, getBearer } from "./supabase";

export async function postAuthed<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = await getBearer();
  if (!token) throw new Error("Not signed in");
  const res = await nativeFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  let payload: unknown = null;
  try { payload = await res.json(); } catch { /* ignore */ }
  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return payload as T;
}
