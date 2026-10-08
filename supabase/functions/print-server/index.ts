// Puerta única del servidor de impresión hacia Supabase.
//
// El servidor (PC con las impresoras) no guarda ninguna llave de Supabase: solo
// el secreto propio que recibe al emparejarse, válido únicamente para su
// organización. Acciones:
//   · create-pairing / unpair  → las llama un admin desde la app (JWT de usuario)
//   · pair                      → el servidor cambia el código de emparejamiento por su secreto
//   · poll / ack                → el servidor (header x-print-secret)
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-print-secret",
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
const PAIRING_TTL_MS = 15 * 60 * 1000;
const MAX_WAIT_SECONDS = 20;
const POLL_INTERVAL_MS = 1500;
const REPORT_MAX_PRINTERS = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const part = (from: number) => Array.from(bytes.slice(from, from + 4)).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
  return `${part(0)}-${part(4)}`;
}

function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Supabase env vars" }, 500);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    // ── Acciones de un admin (JWT de usuario) ────────────────────────────────
    if (action === "create-pairing" || action === "unpair") {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "No autorizado" }, 401);
      const { data: callerData, error: callerError } = await admin.auth.getUser(token);
      if (callerError || !callerData.user) return json({ error: "Sesión inválida" }, 401);

      const orgId = String(body?.organization_id || "");
      if (!orgId) return json({ error: "organization_id requerido" }, 400);

      const { data: membership } = await admin
        .from("usuarios")
        .select("id")
        .eq("user_id", callerData.user.id)
        .eq("organization_id", orgId)
        .eq("rol", "admin")
        .eq("activo", true)
        .eq("_deleted", false)
        .maybeSingle();
      if (!membership) return json({ error: "Solo un administrador puede gestionar el servidor de impresión" }, 403);

      if (action === "unpair") {
        const serverId = String(body?.server_id || "");
        const { error } = await admin
          .from("print_servers")
          .update({ _deleted: true })
          .eq("id", serverId)
          .eq("organization_id", orgId);
        if (error) return json({ error: error.message }, 400);
        await admin.from("print_server_secrets").update({ secret_hash: null, pairing_code_hash: null }).eq("server_id", serverId);
        return json({ ok: true });
      }

      // create-pairing: descarta emparejamientos pendientes anteriores y crea uno nuevo.
      await admin.from("print_servers").delete().eq("organization_id", orgId).is("paired_at", null);

      const code = randomCode();
      const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
      const { data: server, error: insertError } = await admin
        .from("print_servers")
        .insert({ organization_id: orgId })
        .select("id")
        .single();
      if (insertError || !server) return json({ error: insertError?.message || "No se pudo crear el servidor" }, 400);

      const { error: secretError } = await admin.from("print_server_secrets").insert({
        server_id: server.id,
        pairing_code_hash: await sha256Hex(code),
        pairing_expires_at: expiresAt,
      });
      if (secretError) return json({ error: secretError.message }, 400);

      return json({ ok: true, server_id: server.id, code, expires_at: expiresAt });
    }

    // ── El servidor se empareja con el código ────────────────────────────────
    if (action === "pair") {
      const code = String(body?.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
        await sleep(500);
        return json({ error: "Código con formato inválido" }, 400);
      }

      const { data: row } = await admin
        .from("print_server_secrets")
        .select("server_id, pairing_expires_at")
        .eq("pairing_code_hash", await sha256Hex(code))
        .maybeSingle();

      if (!row || !row.pairing_expires_at || new Date(row.pairing_expires_at).getTime() < Date.now()) {
        await sleep(500); // frena la fuerza bruta de códigos
        return json({ error: "Código inválido o vencido" }, 400);
      }

      const { data: server } = await admin
        .from("print_servers")
        .select("id, organization_id")
        .eq("id", row.server_id)
        .eq("_deleted", false)
        .maybeSingle();
      if (!server) return json({ error: "Servidor no encontrado" }, 404);

      const secret = randomSecret();
      const now = new Date().toISOString();

      await admin.from("print_server_secrets").update({
        secret_hash: await sha256Hex(secret),
        pairing_code_hash: null,
        pairing_expires_at: null,
      }).eq("server_id", server.id);

      await admin.from("print_servers").update({
        paired_at: now,
        last_seen: now,
        hostname: typeof body?.hostname === "string" ? body.hostname.slice(0, 120) : null,
        version: typeof body?.version === "string" ? body.version.slice(0, 40) : null,
      }).eq("id", server.id);

      // Un solo servidor por organización: el nuevo reemplaza al anterior.
      await admin.from("print_servers").update({ _deleted: true })
        .eq("organization_id", server.organization_id)
        .neq("id", server.id)
        .eq("_deleted", false);

      // Migra las impresoras que ya tenía configuradas localmente (si se envían).
      const localPrinters = Array.isArray(body?.printers) ? body.printers.slice(0, REPORT_MAX_PRINTERS) : [];
      const { count: existing } = await admin
        .from("print_printers")
        .select("id", { count: "exact", head: true })
        .eq("server_id", server.id)
        .eq("_deleted", false);
      if (!existing && localPrinters.length > 0) {
        await admin.from("print_printers").insert(
          localPrinters
            .filter((p: any) => p?.name && p?.target)
            .map((p: any) => ({
              organization_id: server.organization_id,
              server_id: server.id,
              name: String(p.name).slice(0, 120),
              target: String(p.target).slice(0, 200),
              roles: Array.isArray(p.roles) ? p.roles.filter((r: unknown) => r === "kitchen" || r === "receipt") : [],
              active: p.active !== false,
            })),
        );
      }

      return json({ ok: true, server_id: server.id, organization_id: server.organization_id, secret });
    }

    // ── Acciones del servidor (secreto propio) ───────────────────────────────
    if (action === "poll" || action === "ack") {
      const serverId = String(body?.server_id || "");
      const secret = req.headers.get("x-print-secret") || "";
      if (!serverId || !secret) return json({ error: "No autorizado" }, 401);

      const { data: secretRow } = await admin
        .from("print_server_secrets")
        .select("secret_hash")
        .eq("server_id", serverId)
        .maybeSingle();
      const { data: server } = await admin
        .from("print_servers")
        .select("id, organization_id, _deleted")
        .eq("id", serverId)
        .maybeSingle();

      const hash = await sha256Hex(secret);
      if (!secretRow?.secret_hash || !server || server._deleted || !timingSafeEqual(secretRow.secret_hash, hash)) {
        await sleep(500);
        return json({ error: "Secreto inválido o servidor desvinculado" }, 401);
      }
      const orgId = server.organization_id as string;

      if (action === "ack") {
        const jobId = String(body?.job_id || "");
        const status = body?.status === "done" ? "done" : "failed";
        const now = new Date().toISOString();
        const { error } = await admin
          .from("print_jobs")
          .update({
            status,
            last_error: status === "failed" ? String(body?.error || "Error desconocido").slice(0, 500) : null,
            printed_at: status === "done" ? now : null,
            updated_at: now,
          })
          .eq("id", jobId)
          .eq("organization_id", orgId)
          .eq("claimed_by", serverId);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      // poll: latido + informe opcional + reclamar trabajos (long-poll)
      const report = body?.report || {};
      const update: Record<string, unknown> = { last_seen: new Date().toISOString() };
      if (typeof report.hostname === "string") update.hostname = report.hostname.slice(0, 120);
      if (typeof report.version === "string") update.version = report.version.slice(0, 40);
      if (Array.isArray(report.ips)) update.ips = report.ips.slice(0, 10).map(String);
      if (Array.isArray(report.system_printers)) update.system_printers = report.system_printers.slice(0, REPORT_MAX_PRINTERS).map(String);
      await admin.from("print_servers").update(update).eq("id", serverId);

      const waitMs = Math.min(Math.max(Number(body?.wait_seconds) || 0, 0), MAX_WAIT_SECONDS) * 1000;
      const deadline = Date.now() + waitMs;
      let jobs: unknown[] = [];
      while (true) {
        const { data, error } = await admin.rpc("claim_print_jobs", { p_server_id: serverId, p_org: orgId });
        if (error) return json({ error: error.message }, 500);
        jobs = data || [];
        if (jobs.length > 0 || Date.now() >= deadline) break;
        await sleep(POLL_INTERVAL_MS);
      }

      const { data: printers } = await admin
        .from("print_printers")
        .select("id, name, target, roles, active")
        .eq("server_id", serverId)
        .eq("_deleted", false);

      return json({ ok: true, jobs, printers: printers || [] });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
