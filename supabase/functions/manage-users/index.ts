import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://cardapioproia.vercel.app",
  "https://cardapioproia.com.br",
  "https://www.cardapioproia.com.br",
];

type ManageUsersAction =
  | "create-user"
  | "update-user"
  | "set-role"
  | "delete-user"
  | "send-reset"
  | "add-credits";

function getCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get("origin");
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));
  const isLocalOrigin =
    requestOrigin?.startsWith("http://localhost:") ||
    requestOrigin?.startsWith("http://127.0.0.1:");
  const allowAny = allowedOrigins.includes("*");
  const allowedOrigin =
    allowAny || isLocalOrigin || (requestOrigin && allowedOrigins.includes(requestOrigin))
      ? requestOrigin || "*"
      : allowedOrigins[0];

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function getAppUrl() {
  return (
    Deno.env.get("APP_URL") ||
    Deno.env.get("SITE_URL") ||
    "https://cardapioproia.vercel.app"
  ).replace(/\/$/, "");
}

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function logAdminAction(
  adminClient: ReturnType<typeof createClient>,
  input: {
    actorUserId: string;
    targetUserId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await adminClient.from("admin_audit_logs").insert({
    actor_user_id: input.actorUserId,
    target_user_id: input.targetUserId || null,
    action: input.action,
    metadata: input.metadata || {},
  });

  if (error) {
    console.error("Admin audit log error:", error);
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Variáveis do Supabase não configuradas" }, 500, corsHeaders);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Authorization header obrigatório" }, 401, corsHeaders);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user: requester },
      error: requesterError,
    } = await userClient.auth.getUser();

    if (requesterError || !requester) {
      return json({ error: "Usuário não autenticado" }, 401, corsHeaders);
    }

    const { data: requesterProfile, error: requesterProfileError } = await adminClient
      .from("user_profiles")
      .select("role")
      .eq("user_id", requester.id)
      .maybeSingle();

    if (requesterProfileError) {
      console.error("Requester profile error:", requesterProfileError);
      return json({ error: "Erro ao validar permissões" }, 500, corsHeaders);
    }

    if (requesterProfile?.role !== "admin") {
      return json({ error: "Acesso restrito ao administrador" }, 403, corsHeaders);
    }

    if (req.method === "GET") {
      const { data: profiles, error: profilesError } = await adminClient
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) {
        console.error("Profiles list error:", profilesError);
        return json({ error: "Erro ao listar perfis" }, 500, corsHeaders);
      }

      const { data: authUsersData, error: authUsersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 500,
      });

      if (authUsersError) {
        console.error("Auth users list error:", authUsersError);
      }

      const authUsersById = new Map(
        (authUsersData.users || []).map((authUser) => [
          authUser.id,
          {
            email: authUser.email ?? "",
            last_sign_in_at: authUser.last_sign_in_at ?? null,
            created_at: authUser.created_at ?? null,
          },
        ]),
      );

      const { data: generatedPhotos, error: generatedPhotosError } = await adminClient
        .from("photo_history")
        .select("user_id")
        .not("user_id", "is", null);

      if (generatedPhotosError) {
        console.error("Generated photos count error:", generatedPhotosError);
      }

      const photosByUserId = new Map<string, number>();
      for (const photo of generatedPhotos || []) {
        if (!photo.user_id) continue;
        photosByUserId.set(photo.user_id, (photosByUserId.get(photo.user_id) || 0) + 1);
      }

      const { data: creditsRows, error: creditsError } = await adminClient
        .from("user_credits")
        .select("user_id, credits");

      if (creditsError) {
        console.error("Credits list error:", creditsError);
      }

      const creditsByUserId = new Map<string, number>();
      for (const row of creditsRows || []) {
        if (!row.user_id) continue;
        creditsByUserId.set(row.user_id, Number(row.credits) || 0);
      }

      const users = (profiles || []).map((profile) => {
        const authUser = authUsersById.get(profile.user_id);
        return {
          id: profile.user_id,
          email: profile.email || authUser?.email || "",
          full_name: profile.full_name,
          role: profile.role,
          is_active: profile.is_active,
          is_affiliate: profile.is_affiliate,
          created_at: profile.created_at || authUser?.created_at,
          last_sign_in_at: authUser?.last_sign_in_at ?? null,
          photos_generated: photosByUserId.get(profile.user_id) || 0,
          credits: creditsByUserId.get(profile.user_id) || 0,
        };
      });

      return json({ users }, 200, corsHeaders);
    }

    if (req.method !== "POST") {
      return json({ error: "Método não suportado" }, 405, corsHeaders);
    }

    const body = await req.json();
    const action = body?.action as ManageUsersAction | undefined;

    if (!action) {
      return json({ error: "Ação obrigatória" }, 400, corsHeaders);
    }

    if (action === "create-user") {
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const fullName = String(body?.fullName || "").trim();

      if (!email || !password) {
        return json({ error: "E-mail e senha são obrigatórios" }, 400, corsHeaders);
      }

      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || undefined,
        },
      });

      if (createError || !createdUser.user) {
        console.error("Create user error:", createError);
        return json({ error: createError?.message || "Erro ao criar usuário" }, 400, corsHeaders);
      }

      const { error: profileError } = await adminClient.from("user_profiles").upsert({
        user_id: createdUser.user.id,
        email,
        full_name: fullName || null,
        role: "user",
        is_active: true,
        is_affiliate: false,
      });

      if (profileError) {
        console.error("Create profile error:", profileError);
        return json({ error: "Usuário criado, mas o perfil não foi salvo corretamente" }, 500, corsHeaders);
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        targetUserId: createdUser.user.id,
        action: "create_user",
        metadata: { email, fullName: fullName || null },
      });

      return json({
        user: {
          id: createdUser.user.id,
          email,
          full_name: fullName || null,
          role: "user",
          is_active: true,
          is_affiliate: false,
        },
      }, 200, corsHeaders);
    }

    if (action === "update-user") {
      const targetUserId = String(body?.userId || "");
      const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : undefined;
      const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
      const isAffiliate = typeof body?.isAffiliate === "boolean" ? body.isAffiliate : undefined;

      if (!targetUserId) {
        return json({ error: "Usuário inválido" }, 400, corsHeaders);
      }

      const updates: Record<string, unknown> = {};
      if (fullName !== undefined) updates.full_name = fullName || null;
      if (isActive !== undefined) updates.is_active = isActive;
      if (isAffiliate !== undefined) updates.is_affiliate = isAffiliate;

      if (!Object.keys(updates).length) {
        return json({ error: "Nenhuma alteração recebida" }, 400, corsHeaders);
      }

      const { data: updatedProfile, error: updateProfileError } = await adminClient
        .from("user_profiles")
        .update(updates)
        .eq("user_id", targetUserId)
        .select("*")
        .single();

      if (updateProfileError) {
        console.error("Update profile error:", updateProfileError);
        return json({ error: "Erro ao atualizar usuário" }, 500, corsHeaders);
      }

      if (fullName !== undefined) {
        const { error: updateUserError } = await adminClient.auth.admin.updateUserById(targetUserId, {
          user_metadata: {
            full_name: fullName || undefined,
          },
        });

        if (updateUserError) {
          console.error("Update auth user metadata error:", updateUserError);
        }
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        targetUserId,
        action: "update_user",
        metadata: updates,
      });

      return json({ user: updatedProfile }, 200, corsHeaders);
    }

    if (action === "send-reset") {
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email) {
        return json({ error: "E-mail obrigatório" }, 400, corsHeaders);
      }

      const redirectTo = `${getAppUrl()}/login`;

      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) {
        console.error("Reset password error:", resetError);
        return json({ error: resetError.message || "Erro ao enviar e-mail de redefinição" }, 500, corsHeaders);
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        action: "send_password_reset",
        metadata: { email, redirectTo },
      });

      return json({ success: true }, 200, corsHeaders);
    }

    if (action === "set-role") {
      const targetUserId = String(body?.userId || "");
      const role = String(body?.role || "").trim();

      if (!targetUserId || !["admin", "user"].includes(role)) {
        return json({ error: "Perfil inválido" }, 400, corsHeaders);
      }

      const { data: updatedProfile, error: roleError } = await adminClient
        .from("user_profiles")
        .update({
          role,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", targetUserId)
        .select("*")
        .single();

      if (roleError) {
        console.error("Set role error:", roleError);
        return json({ error: "Erro ao atualizar perfil do usuário" }, 500, corsHeaders);
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        targetUserId,
        action: "set_role",
        metadata: { role },
      });

      return json({ user: updatedProfile }, 200, corsHeaders);
    }

    if (action === "add-credits") {
      const targetUserId = String(body?.userId || "");
      const amount = Number(body?.amount);

      if (!targetUserId) {
        return json({ error: "Usuário inválido" }, 400, corsHeaders);
      }

      if (!Number.isInteger(amount) || amount <= 0 || amount > 999_999) {
        return json({ error: "Informe uma quantidade de créditos válida" }, 400, corsHeaders);
      }

      const { data: currentCredits, error: currentCreditsError } = await adminClient
        .from("user_credits")
        .select("credits")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (currentCreditsError && currentCreditsError.code !== "PGRST116") {
        console.error("Current credits error:", currentCreditsError);
        return json({ error: "Erro ao consultar créditos atuais" }, 500, corsHeaders);
      }

      const nextCredits = Math.min((Number(currentCredits?.credits) || 0) + amount, 999_999);

      const { data: updatedCredits, error: updateCreditsError } = await adminClient
        .from("user_credits")
        .upsert({
          user_id: targetUserId,
          credits: nextCredits,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" })
        .select("credits")
        .single();

      if (updateCreditsError) {
        console.error("Add credits error:", updateCreditsError);
        return json({ error: "Erro ao adicionar créditos" }, 500, corsHeaders);
      }

      const { error: creditTransactionError } = await adminClient.from("credit_transactions").insert({
        user_id: targetUserId,
        amount,
        balance_after: updatedCredits.credits,
        reason: "admin_manual_add",
        reference_type: "admin_action",
        reference_id: requester.id,
        created_by: requester.id,
        metadata: {
          previous_balance: Number(currentCredits?.credits) || 0,
        },
      });

      if (creditTransactionError) {
        console.error("Credit transaction audit error:", creditTransactionError);
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        targetUserId,
        action: "add_credits",
        metadata: {
          amount,
          balance_after: updatedCredits.credits,
        },
      });

      return json({ credits: updatedCredits.credits }, 200, corsHeaders);
    }

    if (action === "delete-user") {
      const targetUserId = String(body?.userId || "");

      if (!targetUserId) {
        return json({ error: "Usuário inválido" }, 400, corsHeaders);
      }

      if (targetUserId === requester.id) {
        return json({ error: "Não é permitido remover seu próprio usuário por aqui" }, 400, corsHeaders);
      }

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);

      if (deleteError) {
        console.error("Delete user error:", deleteError);
        return json({ error: deleteError.message || "Erro ao remover usuário" }, 500, corsHeaders);
      }

      await logAdminAction(adminClient, {
        actorUserId: requester.id,
        targetUserId,
        action: "delete_user",
      });

      return json({ success: true }, 200, corsHeaders);
    }

    return json({ error: "Ação não suportada" }, 400, corsHeaders);
  } catch (error) {
    console.error("manage-users error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno no gerenciamento de usuários" },
      500,
      corsHeaders,
    );
  }
});
