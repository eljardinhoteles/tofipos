import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ManageUsersPayload = {
  action: "ensure-self" | "create" | "update" | "delete";
  organization_id: string;
  // create / update. `id` es el id de la MEMBRESÍA (fila en usuarios), no el de Auth.
  user?: {
    id?: string;
    nombre?: string;
    rol?: "admin" | "mesero" | "cajero";
    email?: string;
    password?: string;
    activo?: boolean;
  };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Identificar al llamador por su JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autorizado" }, 401);

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Sesión inválida" }, 401);
    const caller = callerData.user;

    const payload = (await req.json()) as ManageUsersPayload;
    const orgId = payload.organization_id;
    if (!orgId) return json({ error: "organization_id requerido" }, 400);

    const now = new Date().toISOString();

    // Membresía del llamador en esa organización
    const { data: callerProfile } = await admin
      .from("usuarios")
      .select("id, user_id, rol, activo, _deleted")
      .eq("user_id", caller.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    const callerIsAdmin =
      !!callerProfile &&
      callerProfile.rol === "admin" &&
      callerProfile.activo === true &&
      callerProfile._deleted !== true;

    // Busca el auth user id de un email: primero en perfiles, luego en Auth
    const findAuthUserIdByEmail = async (email: string): Promise<string | null> => {
      const { data: profile } = await admin
        .from("usuarios")
        .select("user_id")
        .eq("email", email)
        .limit(1)
        .maybeSingle();
      if (profile?.user_id) return profile.user_id;

      // Fallback: buscar en Auth (paginado; suficiente para el volumen de un POS)
      for (let page = 1; page <= 10; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error || !data?.users?.length) break;
        const match = data.users.find((u: { id: string; email?: string }) => u.email?.toLowerCase() === email);
        if (match) return match.id;
        if (data.users.length < 200) break;
      }
      return null;
    };

    // --- ensure-self: crea la membresía admin de quien configuró el dispositivo ---
    if (payload.action === "ensure-self") {
      if (callerProfile) return json({ ok: true, created: false });

      // Solo se permite auto-crearse como admin si la organización aún no tiene admins
      const { count } = await admin
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("rol", "admin")
        .eq("_deleted", false);

      if ((count ?? 0) > 0) {
        return json({ error: "La organización ya tiene administradores; pide que te creen un perfil." }, 403);
      }

      const { error } = await admin.from("usuarios").insert({
        id: crypto.randomUUID(),
        user_id: caller.id,
        nombre: caller.email?.split("@")[0] || "Admin",
        rol: "admin",
        email: caller.email,
        organization_id: orgId,
        activo: true,
        _deleted: false,
        _modified: now,
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, created: true });
    }

    // --- Resto de acciones: requieren ser admin de la organización ---
    if (!callerIsAdmin) return json({ error: "Requiere rol administrador en la organización." }, 403);

    const user = payload.user;
    if (!user) return json({ error: "user requerido" }, 400);

    if (payload.action === "create") {
      if (!user.email || !user.nombre || !user.rol) {
        return json({ error: "nombre, rol y email son requeridos" }, 400);
      }
      const email = user.email.trim().toLowerCase();

      // ¿Ya existe la cuenta? → invitarla a esta organización (membresía nueva),
      // conservando su contraseña actual.
      const existingUserId = await findAuthUserIdByEmail(email);

      let authUserId = existingUserId;
      let invitedExisting = false;

      if (existingUserId) {
        const { data: existingMembership } = await admin
          .from("usuarios")
          .select("id, _deleted, activo")
          .eq("user_id", existingUserId)
          .eq("organization_id", orgId)
          .maybeSingle();

        if (existingMembership && existingMembership._deleted !== true) {
          return json({ error: "Ese usuario ya pertenece a esta organización." }, 400);
        }
        if (existingMembership) {
          // Membresía borrada: reactivarla
          const { error } = await admin
            .from("usuarios")
            .update({ nombre: user.nombre, rol: user.rol, activo: user.activo ?? true, _deleted: false, _modified: now })
            .eq("id", existingMembership.id);
          if (error) return json({ error: error.message }, 400);
          await admin.auth.admin.updateUserById(existingUserId, { ban_duration: "none" });
          return json({ ok: true, id: existingMembership.id, existing: true });
        }
        invitedExisting = true;
      } else {
        // Cuenta nueva: requiere contraseña temporal
        if (!user.password || user.password.length < 6) {
          return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
        }
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password: user.password,
          email_confirm: true,
          user_metadata: { nombre: user.nombre },
        });
        if (createError) return json({ error: createError.message }, 400);
        authUserId = created.user.id;
      }

      const membershipId = crypto.randomUUID();
      const { error: profileError } = await admin.from("usuarios").insert({
        id: membershipId,
        user_id: authUserId,
        nombre: user.nombre,
        rol: user.rol,
        email,
        organization_id: orgId,
        activo: user.activo ?? true,
        _deleted: false,
        _modified: now,
      });
      if (profileError) {
        if (!invitedExisting && authUserId) {
          // Rollback del usuario de Auth recién creado para no dejar huérfanos
          await admin.auth.admin.deleteUser(authUserId);
        }
        return json({ error: profileError.message }, 400);
      }
      return json({ ok: true, id: membershipId, existing: invitedExisting });
    }

    if (payload.action === "update" || payload.action === "delete") {
      if (!user.id) return json({ error: "user.id requerido" }, 400);

      const { data: target } = await admin
        .from("usuarios")
        .select("id, user_id, organization_id, rol")
        .eq("id", user.id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (!target) return json({ error: "Usuario no encontrado en la organización" }, 404);

      const isSelf = target.user_id === caller.id;

      // ¿Tiene otras membresías activas? (no tocar Auth global si opera en otras orgs)
      const { count: otherMemberships } = await admin
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("user_id", target.user_id)
        .neq("id", target.id)
        .eq("_deleted", false);
      const hasOtherOrgs = (otherMemberships ?? 0) > 0;

      if (payload.action === "delete") {
        if (isSelf) return json({ error: "No puedes eliminar tu propia cuenta." }, 400);
        const { error } = await admin
          .from("usuarios")
          .update({ activo: false, _deleted: true, _modified: now })
          .eq("id", target.id);
        if (error) return json({ error: error.message }, 400);
        // Bloquear acceso en Auth solo si no pertenece a ninguna otra organización
        if (!hasOtherOrgs) {
          await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "876000h" });
        }
        return json({ ok: true });
      }

      // update
      if (isSelf && (user.activo === false || (user.rol && user.rol !== "admin"))) {
        return json({ error: "No puedes desactivarte ni quitarte el rol admin a ti mismo." }, 400);
      }

      const profilePatch: Record<string, unknown> = { _modified: now };
      if (user.nombre !== undefined) profilePatch.nombre = user.nombre;
      if (user.rol !== undefined) profilePatch.rol = user.rol;
      if (user.activo !== undefined) profilePatch.activo = user.activo;
      if (user.email !== undefined) profilePatch.email = user.email.trim().toLowerCase();

      const { error: updateError } = await admin
        .from("usuarios")
        .update(profilePatch)
        .eq("id", target.id);
      if (updateError) return json({ error: updateError.message }, 400);

      // Cambios de credenciales afectan la cuenta GLOBAL (todas sus organizaciones)
      if (user.password || user.email !== undefined) {
        if (user.password && user.password.length < 6) {
          return json({ error: "La contraseña debe tener al menos 6 caracteres." }, 400);
        }
        const authPatch: Record<string, unknown> = {};
        if (user.password) authPatch.password = user.password;
        if (user.email !== undefined) authPatch.email = user.email.trim().toLowerCase();
        const { error: authError } = await admin.auth.admin.updateUserById(target.user_id, authPatch);
        if (authError) return json({ error: authError.message }, 400);
      }

      // Si se (re)activa, levantar posible ban previo
      if (user.activo === true) {
        await admin.auth.admin.updateUserById(target.user_id, { ban_duration: "none" });
      }

      return json({ ok: true });
    }

    return json({ error: "Acción no soportada" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
