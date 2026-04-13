import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildLoginRedirectUrl } from "../_shared/security.ts";

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

type ManageUsersAction = "create-user" | "update-user" | "delete-user" | "send-reset";

function getCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get("origin");
  const configuredOrigins = [
    Deno.env.get("APP_URL"),
    ...(Deno.env.get("ALLOWED_ORIGIN") || "").split(","),
  ]
    .map((origin) => origin?.trim())
    .filter(Boolean) as string[];
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));
  const isLocalOrigin =
    requestOrigin?.startsWith("http://localhost:") ||
    requestOrigin?.startsWith("http://127.0.0.1:");
  const allowedOrigin =
    isLocalOrigin || (requestOrigin && allowedOrigins.includes(requestOrigin))
      ? requestOrigin || allowedOrigins[0]
      : allowedOrigins[0];

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
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
        return json({ error: "Erro ao listar usuários" }, 500, corsHeaders);
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
        return json({ error: "Erro ao contar fotos geradas" }, 500, corsHeaders);
      }

      const photosByUserId = new Map<string, number>();
      for (const photo of generatedPhotos || []) {
        if (!photo.user_id) continue;
        photosByUserId.set(photo.user_id, (photosByUserId.get(photo.user_id) || 0) + 1);
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

      return json({ user: updatedProfile }, 200, corsHeaders);
    }

    if (action === "send-reset") {
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email) {
        return json({ error: "E-mail obrigatório" }, 400, corsHeaders);
      }

      let redirectTo: string;
      try {
        redirectTo = buildLoginRedirectUrl(Deno.env.get("APP_URL"));
      } catch (error) {
        console.error("Reset password APP_URL error:", error);
        return json({ error: error instanceof Error ? error.message : "APP_URL inválido" }, 500, corsHeaders);
      }

      const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (resetError) {
        console.error("Reset password error:", resetError);
        return json({ error: resetError.message || "Erro ao enviar e-mail de redefinição" }, 500, corsHeaders);
      }

      return json({ success: true }, 200, corsHeaders);
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
