// Player accounts on Supabase (REST, no SDK). An account = in-game ID + password (Supabase stores it
// under a made-up e-mail address, so "Confirm email" must be off), plus a profile row holding the
// game-server key (the ranking follows the account to any device) and save data.
// Setup: run web/supabase.sql in the Supabase SQL editor, then fill in the two values below.

const SUPABASE_URL_DEFAULT = "https://htvrqosrohofaypqexru.supabase.co";
const SUPABASE_KEY_DEFAULT = "sb_publishable_6jGB5bDAR6UvqEy29smZfw_VVgJrqoy";   // publishable key: public by design (never the secret key)
// tests can point the page at a mock: ?sb=<url>&sbkey=<key>
const q = new URLSearchParams(location.search);
const SUPABASE_URL = q.get("sb") || SUPABASE_URL_DEFAULT;
const SUPABASE_KEY = q.get("sbkey") || SUPABASE_KEY_DEFAULT;
const MAIL_DOMAIN = "players.pixelmurim.duckdns.org";
const LS_SESSION = "pixelmurim.session";

interface Session { access: string; refresh: string; expires: number; uid: string }
interface Profile { name: string; server_token: string; save: Record<string, unknown> }

let session: Session | null = null;
let profile: Profile | null = null;

export const configured = () => SUPABASE_URL !== "" && SUPABASE_KEY !== "";
export const loggedIn = () => profile !== null;
export const name = () => profile?.name ?? "";
export const serverToken = () => profile?.server_token ?? "";
export const saveData = () => profile?.save ?? {};

export const cleanId = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
const mailOf = (id: string) => id.toLowerCase() + "@" + MAIL_DOMAIN;

function lsGet(k: string): string { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } }
function lsSet(k: string, v: string): void { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } }

async function call(path: string, body: unknown, method = "POST", auth = false, extra: Record<string, string> = {}): Promise<unknown> {
  const h: Record<string, string> = { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...extra };
  if (auth && session) h.Authorization = "Bearer " + session.access;   // publishable keys are not JWTs: apikey alone otherwise
  const r = await fetch(SUPABASE_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const m = (data && (data.msg || data.message || data.error_description || data.error)) || "HTTP " + r.status;
    throw new Error(String(m));
  }
  return data;
}

function takeSession(d: unknown): void {
  const s = d as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string } };
  if (!s.access_token || !s.refresh_token || !s.user) throw new Error("NO SESSION (TURN OFF CONFIRM EMAIL IN SUPABASE)");
  session = { access: s.access_token, refresh: s.refresh_token, expires: Date.now() + (s.expires_in ?? 3600) * 1000, uid: s.user.id };
  lsSet(LS_SESSION, JSON.stringify(session));
}

async function fresh(): Promise<void> {
  if (!session) throw new Error("NOT LOGGED IN");
  if (Date.now() < session.expires - 60000) return;
  takeSession(await call("/auth/v1/token?grant_type=refresh_token", { refresh_token: session.refresh }));
}

async function loadProfile(): Promise<void> {
  await fresh();
  const rows = (await call("/rest/v1/profiles?select=name,server_token,save&id=eq." + session!.uid, undefined, "GET", true)) as Profile[];
  if (!rows.length) throw new Error("NO PROFILE");
  profile = rows[0];
  applySave();
}

/** Restore the last login in this browser (quietly; stays logged out on any problem). */
export async function init(): Promise<void> {
  if (!configured()) return;
  try {
    const s = lsGet(LS_SESSION);
    if (!s) return;
    session = JSON.parse(s);
    await loadProfile();
  } catch { session = null; profile = null; }
}

function newToken(): string {
  const set = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (v) => set[v % set.length]).join("");
}

export async function signUp(idRaw: string, pw: string): Promise<void> {
  if (!configured()) throw new Error("ACCOUNTS ARE NOT SET UP YET");
  const id = cleanId(idRaw);
  if (!id) throw new Error("ID: LETTERS AND NUMBERS, UP TO 10");
  if (pw.length < 6) throw new Error("PASSWORD: AT LEAST 6 CHARACTERS");
  if (await call("/rest/v1/rpc/name_taken", { n: id })) throw new Error("THIS ID IS TAKEN");
  takeSession(await call("/auth/v1/signup", { email: mailOf(id), password: pw }));
  // keep the ranking key this browser already played with, if any
  const old = lsGet("pixelmurim.token");
  const row = { id: session!.uid, name: id, server_token: old.length >= 16 ? old : newToken(), save: localSave() };
  await call("/rest/v1/profiles", row, "POST", true, { Prefer: "return=minimal" });
  await loadProfile();
}

export async function logIn(idRaw: string, pw: string): Promise<void> {
  if (!configured()) throw new Error("ACCOUNTS ARE NOT SET UP YET");
  const id = cleanId(idRaw);
  try {
    takeSession(await call("/auth/v1/token?grant_type=password", { email: mailOf(id), password: pw }));
  } catch (e) {
    throw new Error(/invalid/i.test(String(e)) ? "WRONG ID OR PASSWORD" : String((e as Error).message));
  }
  await loadProfile();
}

export function logOut(): void {
  if (session) call("/auth/v1/logout", {}, "POST", true).catch(() => undefined);
  session = null; profile = null;
  lsSet(LS_SESSION, "");
}

// ---------------------------------------------------------------- save data (arcade unlock, later story mode)

function localSave(): Record<string, unknown> {
  return lsGet("pixelmurim.cheonma") === "1" ? { cheonma: true } : {};
}

/** Account save -> this browser (a clear on another device unlocks here too). */
function applySave(): void {
  if (profile?.save?.cheonma) lsSet("pixelmurim.cheonma", "1");
}

/** Merge keys into the account's save data (fire and forget; also fine when logged out). */
export function store(patch: Record<string, unknown>): void {
  if (!profile || !session) return;
  profile.save = { ...profile.save, ...patch };
  const save = profile.save;
  fresh().then(() => call("/rest/v1/profiles?id=eq." + session!.uid, { save, updated_at: new Date().toISOString() }, "PATCH", true, { Prefer: "return=minimal" }))
    .catch(() => undefined);
}
