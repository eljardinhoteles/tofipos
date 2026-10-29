import { createClient } from "jsr:@supabase/supabase-js@2";

// Envía por Resend el correo de confirmación o cancelación de reserva(s) del Hotel.
// Secretos: RESEND_API_KEY, RESEND_FROM ("El Jardín <reservas@tudominio.com>"), opcional HOTEL_NOMBRE y RESEND_REPLY_TO.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const dinero = (n: number) => `$${Number(n).toFixed(2)}`;


interface Doc {
  org: { nombre: string; ruc: string; telefono: string; direccion: string; email?: string; logo?: string };
  codigo: string | null;
  canal: string | null;
  huesped: { nombre: string; documento: string | null; email: string; telefono: string; pais: string; direccion?: string };
  llegada: string; salida: string; noches: number;
  cabanas: Array<{ nombre: string; cama: string | null; adultos: number; ninos: number; tarifa: number; vista: string | null }>;
  extras: Array<{ descripcion: string; monto: number; notas: string[] }>;
  total: number;
  cobros?: { pagado: number; saldo: number };
  notas: string | null;
  notasGenerales: string[];
  mascotas: string[];
  plan: { nombre: string; adultos: number; ninos: number; incluyeAdulto: string; incluyeNino: string; incluido: boolean } | null;
}

const VERDE = "#2f5a45";
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const texto = (v: unknown, max = 300) => String(v ?? "").slice(0, max);

// Correo limpio, a una columna, con tablas y estilos en línea (lo que respetan Gmail y Outlook).
const titulo = (t: string) => `<tr><td style="padding:22px 0 8px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${VERDE}">${esc(t)}</td></tr>`;
const dato = (t: string, v: string, ancho = "") => `<td${ancho ? ` width="${ancho}"` : ""} style="padding:4px 12px 4px 0;vertical-align:top"><div style="font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:#777">${esc(t)}</div><div style="font-size:14px;color:#1a1a1a">${esc(v || "—")}</div></td>`;

function render(d: Doc, cancelada: boolean, nombrePila: string): { html: string; hotel: string } {
  const hotel = d.org.nombre || Deno.env.get("HOTEL_NOMBRE") || "Reserva";
  const huespedes = d.cabanas.reduce((a, c) => a + c.adultos + c.ninos, 0);
  const contacto = [d.org.telefono && `Tel. ${d.org.telefono}`, d.org.direccion].filter(Boolean).join(" · ");
  const intro = cancelada
    ? `Hola ${esc(nombrePila)}, tu reserva en <strong>${esc(hotel)}</strong> fue cancelada. Si crees que es un error, ${d.org.email ? `escríbenos a <a href="mailto:${esc(d.org.email)}" style="color:${VERDE}">${esc(d.org.email)}</a>` : "contáctanos"}.`
    : `Hola ${esc(nombrePila)}, tu reserva en <strong>${esc(hotel)}</strong> está confirmada. Estos son los datos:`;

  const filasCab = d.cabanas.map((c) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #ecedea;font-size:14px"><strong>${esc(c.nombre)}</strong>${c.vista ? `<span style="color:#777"> · ${esc(c.vista)}</span>` : ""}
        <div style="font-size:12px;color:#555;margin-top:2px">${esc(plural(d.noches, "noche", "noches"))} · ${esc(plural(c.adultos, "adulto", "adultos"))}${c.ninos ? `, ${esc(plural(c.ninos, "niño", "niños"))}` : ""}${c.cama ? ` · Cama ${esc(c.cama)}` : ""}</div></td>
      <td align="right" style="padding:10px 0;border-bottom:1px solid #ecedea;font-size:14px;white-space:nowrap">${dinero(c.tarifa)}</td></tr>`).join("");
  const filasExtras = d.extras.map((e) => `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #ecedea;font-size:14px">${esc(e.descripcion)}${e.notas.map((n) => `<div style="font-size:12px;color:#555;margin-top:2px">${esc(n)}</div>`).join("")}</td>
      <td align="right" style="padding:8px 0;border-bottom:1px solid #ecedea;font-size:14px;white-space:nowrap">${dinero(e.monto)}</td></tr>`).join("");
  const obs = [
    ...d.mascotas.map((m) => `Mascota: ${m}`),
    ...(d.notas ? [d.notas] : []),
    ...d.notasGenerales,
  ];
  const plan = d.plan ? `<tr><td colspan="2" style="padding:12px 0 0;font-size:13px;color:#333">
      <strong>Plan de alimentación:</strong> ${esc(d.plan.nombre)} <span style="color:#777">(${d.plan.incluido ? "incluido en la tarifa" : "se cobra aparte"})</span>
      ${[[d.plan.adultos, "adulto", "adultos", d.plan.incluyeAdulto], [d.plan.ninos, "niño", "niños", d.plan.incluyeNino]].filter((g) => (g[0] as number) > 0)
        .map((g) => `<div style="font-size:12px;color:#555;margin-top:2px"><strong>${esc(plural(g[0] as number, g[1] as string, g[2] as string))}:</strong> ${esc((g[3] as string) || "—")}</div>`).join("")}
    </td></tr>` : "";

  // Estado de pago al final (solo en la confirmación): lo pagado, el saldo y una etiqueta clara.
  const c = d.cobros;
  const pagada = !!c && c.saldo <= 0.005 && d.total > 0.005;
  const filaPago = (t: string, v: string, fuerte: boolean) => `<tr><td style="padding:2px 14px;font-size:${fuerte ? 14 : 13}px;${fuerte ? "font-weight:700" : "color:#555"}">${t}</td><td align="right" style="padding:2px 14px;font-size:${fuerte ? 14 : 13}px;${fuerte ? "font-weight:700" : "color:#555"}">${v}</td></tr>`;
  const estadoPago = !c || cancelada ? "" : `<tr><td style="padding-top:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${c.pagado > 0.005 ? filaPago("Pagado", dinero(c.pagado), false) : ""}${filaPago("Saldo", dinero(c.saldo), true)}</table></td></tr>
    <tr><td align="right" style="padding-top:12px"><span style="display:inline-block;padding:5px 12px;border-radius:4px;font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:${pagada ? "#2f5a45" : "#8a5200"};background:${pagada ? "#dfeae1" : "#f8ecd0"}">${pagada ? "Pagado en su totalidad" : "Saldo pendiente de pago"}</span></td></tr>`;

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f4f5f2;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px">
<tr><td style="padding:28px 28px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid ${VERDE}"><tr>
    <td style="padding-bottom:12px">${d.org.logo ? `<img src="${esc(d.org.logo)}" alt="${esc(hotel)}" height="44" style="display:block;height:44px;max-width:200px;width:auto;border:0;margin-bottom:6px">` : ""}<div style="font-size:${d.org.logo ? 13 : 18}px;font-weight:800">${esc(hotel)}</div>${contacto ? `<div style="font-size:12px;color:#555;margin-top:2px">${esc(contacto)}</div>` : ""}</td>
    <td align="right" style="padding-bottom:12px;vertical-align:top"><div style="font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${cancelada ? "#b91c1c" : VERDE}">${cancelada ? "Reserva cancelada" : "Confirmación de reserva"}</div>${d.codigo ? `<div style="font-size:15px;font-weight:600;letter-spacing:1px;margin-top:3px">${esc(d.codigo)}</div>` : ""}</td>
  </tr></table>
  <p style="font-size:14px;line-height:1.55;margin:18px 0 0">${intro}</p>
</td></tr>
<tr><td style="padding:0 28px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  ${titulo("Datos del huésped")}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${dato("Nombre", d.huesped.nombre + (d.huesped.documento ? ` · ${d.huesped.documento}` : ""))}
    ${dato("Contacto", [d.huesped.telefono, d.huesped.email].filter(Boolean).join(" · "))}
  </tr><tr>${dato("País · Origen", [d.huesped.pais, d.canal].filter(Boolean).join(" · "))}${d.huesped.direccion ? dato("Dirección", d.huesped.direccion) : ""}</tr></table></td></tr>
  ${obs.length ? titulo("Observaciones") + `<tr><td style="font-size:13px;line-height:1.5;color:#333">${obs.map((o) => `<div style="margin-bottom:4px;white-space:pre-line">• ${esc(o)}</div>`).join("")}</td></tr>` : ""}
  ${titulo("Datos de la estadía")}
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8f5;border-radius:6px"><tr>
    <td style="padding:10px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${dato("Llegada", d.llegada, "50%")}${dato("Salida", d.salida, "50%")}</tr><tr>${dato("Noches", String(d.noches), "50%")}${dato("Huéspedes", String(huespedes), "50%")}</tr></table></td>
  </tr></table></td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${plan}</table></td></tr>
  <tr><td style="padding-top:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="padding-bottom:6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#555;border-bottom:1px solid #c9cdc4">${d.cabanas.length > 1 ? "Habitaciones" : "Habitación"}</td><td align="right" style="padding-bottom:6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#555;border-bottom:1px solid #c9cdc4">Importe</td></tr>
    ${filasCab}
  </table></td></tr>
  ${filasExtras ? `<tr><td style="padding-top:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#555;border-bottom:1px solid #c9cdc4">Extras</td><td align="right" style="padding-bottom:6px;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#555;border-bottom:1px solid #c9cdc4">Importe</td></tr>${filasExtras}</table></td></tr>` : ""}
  <tr><td style="padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2ee;border-radius:6px"><tr>
    <td style="padding:12px 14px;font-size:16px;font-weight:800">Total</td><td align="right" style="padding:12px 14px;font-size:18px;font-weight:900">${dinero(d.total)}</td>
  </tr></table></td></tr>
  ${estadoPago}
</table></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td align="center" style="padding:16px 12px 0;font-size:12px;line-height:1.6;color:#777">
  <strong style="color:#555">${esc(hotel)}</strong>
  ${d.org.direccion ? `<br>${esc(d.org.direccion)}` : ""}
  ${d.org.telefono ? `<br>Tel. ${esc(d.org.telefono)}` : ""}
  ${d.org.email ? `<br><a href="mailto:${esc(d.org.email)}" style="color:#555">${esc(d.org.email)}</a>` : ""}
  ${d.org.ruc ? `<br>RUC ${esc(d.org.ruc)}` : ""}
  <br><span style="font-size:11px;color:#999">Este es un correo automático, por favor no respondas a este mensaje.</span>
</td></tr></table>
</td></tr></table></body></html>`;
  return { html, hotel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("RESEND_FROM");
    if (!url || !serviceKey) return json({ error: "Missing Supabase env vars" }, 500);
    if (!resendKey || !from) return json({ error: "Falta RESEND_API_KEY o RESEND_FROM" }, 500);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autorizado" }, 401);
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u.user) return json({ error: "Sesión inválida" }, 401);

    const { tipo, reserva_ids, doc } = (await req.json()) as { tipo: "confirmacion" | "cancelacion"; reserva_ids: string[]; doc?: Doc };
    if ((tipo !== "confirmacion" && tipo !== "cancelacion") || !Array.isArray(reserva_ids) || reserva_ids.length === 0 || !doc || !Array.isArray(doc.cabanas)) {
      return json({ error: "Datos inválidos" }, 400);
    }

    const { data: filas, error } = await admin
      .from("hotel_reservas")
      .select("id, organization_id, cabana, llegada, salida, adultos, ninos, huesped_nombre, huesped_apellido, huesped_email, total_estadia, estado, cloudbeds_reservation_id")
      .in("id", reserva_ids.slice(0, 20));
    if (error) return json({ error: error.message }, 500);
    if (!filas?.length) return json({ ok: true, enviado: false, motivo: "sin reservas" });

    // El llamador debe ser un usuario activo de la organización de las reservas.
    const orgId = filas[0].organization_id;
    if (filas.some((f) => f.organization_id !== orgId)) return json({ error: "Reservas de distintas organizaciones" }, 400);
    const { data: perfil } = await admin.from("usuarios").select("id").eq("user_id", u.user.id).eq("organization_id", orgId).eq("activo", true).maybeSingle();
    if (!perfil) return json({ error: "Sin acceso" }, 403);

    // Solo se avisa lo que de verdad quedó en ese estado (evita correos de confirmación de reservas ya canceladas).
    const estadoEsperado = tipo === "confirmacion" ? "confirmada" : "cancelada";
    const rs = filas.filter((f) => f.estado === estadoEsperado);
    const para = String(rs[0]?.huesped_email ?? "").trim();
    if (!rs.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return json({ ok: true, enviado: false, motivo: "sin correo válido" });

    // Correo y logo de la organización (Ajustes): se leen aquí, no del dispositivo. `*` tolera que falte alguna columna.
    const { data: orgFila } = await admin.from("organizaciones").select("*").eq("id", orgId).maybeSingle();
    const orgEmail = String(orgFila?.email ?? "").trim();
    const orgLogo = String(orgFila?.logo_url ?? "").trim();
    doc.org = {
      ...doc.org,
      nombre: String(orgFila?.nombre ?? "").trim() || doc.org.nombre,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orgEmail) ? orgEmail : undefined,
      logo: /^https:\/\/\S+$/.test(orgLogo) ? orgLogo : undefined,
    };

    const confirm = tipo === "confirmacion";
    // Remitente: la dirección verificada de RESEND_FROM con el nombre de la organización ("Hotel X <noreply@dominio>").
    const direccionFrom = from.match(/<([^>]+)>/)?.[1] ?? from;
    const { html, hotel } = render(doc, !confirm, texto(rs[0].huesped_nombre, 80));
    const asunto = confirm ? `Reserva confirmada · ${hotel}` : `Reserva cancelada · ${hotel}`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${hotel.replace(/[<>"\r\n,;]/g, "").trim() || "Reservas"} <${direccionFrom}>`, to: [para], subject: asunto, html,
        ...((doc.org.email ?? Deno.env.get("RESEND_REPLY_TO")) ? { reply_to: doc.org.email ?? Deno.env.get("RESEND_REPLY_TO") } : {}),
      }),
    });
    if (!resp.ok) return json({ error: `Resend: ${(await resp.text()).slice(0, 300)}` }, 502);
    return json({ ok: true, enviado: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error interno" }, 500);
  }
});
