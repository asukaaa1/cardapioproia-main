import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRIVATE_PHOTO_BUCKET = "photo-history";
const STORAGE_REF_PREFIX = `storage://${PRIVATE_PHOTO_BUCKET}/`;
const EXPIRED_BATCH_SIZE = 25;
const DESTRUCTIVE_BATCH_SIZE = 1;

type CleanupMode = "expired" | "all";
type CleanupAuthMode = "token" | "admin" | "none";

type PhotoRow = {
  id: string;
  original_image_url: string | null;
  result_image_url: string | null;
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...securityHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getStoragePathFromRef(value: string | null | undefined) {
  if (!value?.startsWith(STORAGE_REF_PREFIX)) return null;
  return value.replace(STORAGE_REF_PREFIX, "");
}

async function isAdminRequest(req: Request, supabaseUrl: string, anonKey: string) {
  const configuredToken = Deno.env.get("CLEANUP_PHOTOS_TOKEN");
  const providedToken = req.headers.get("x-cleanup-token");

  if (configuredToken && providedToken === configuredToken) {
    return "token" as const;
  }

  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return "none" as const;
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    console.error("cleanup auth error:", userError);
    return "none" as const;
  }

  const { data: profile, error: profileError } = await userClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("cleanup profile error:", profileError);
    return "none" as const;
  }

  return profile?.role === "admin" ? "admin" as const : "none" as const;
}

async function removeStorageObjects(adminClient: ReturnType<typeof createClient>, photos: PhotoRow[]) {
  const storagePaths = photos
    .flatMap((photo) => [
      getStoragePathFromRef(photo.original_image_url),
      getStoragePathFromRef(photo.result_image_url),
    ])
    .filter((path): path is string => Boolean(path));

  if (storagePaths.length === 0) {
    return { removed: 0, error: null };
  }

  const { error } = await adminClient.storage.from(PRIVATE_PHOTO_BUCKET).remove(storagePaths);
  if (error) {
    console.error("cleanup storage error:", error);
    return { removed: 0, error };
  }

  return { removed: storagePaths.length, error: null };
}

async function cleanupPhotos(adminClient: ReturnType<typeof createClient>, mode: CleanupMode) {
  let removedPhotos = 0;
  let removedStorageObjects = 0;
  let storageErrors = 0;

  while (true) {
    const batchSize = mode === "all" ? DESTRUCTIVE_BATCH_SIZE : EXPIRED_BATCH_SIZE;

    let query = adminClient
      .from("photo_history")
      .select("id")
      .limit(batchSize);

    if (mode === "expired") {
      query = query.lt("expires_at", new Date().toISOString());
    }

    const { data: photos, error: selectError } = await query;

    if (selectError) {
      console.error("cleanup select error:", selectError);
      throw selectError;
    }

    if (!photos || photos.length === 0) {
      break;
    }

    if (mode === "expired") {
      const photoIds = photos.map((photo) => photo.id);
      const { data: storagePhotos, error: storageSelectError } = await adminClient
        .from("photo_history")
        .select("id, original_image_url, result_image_url")
        .in("id", photoIds)
        .or("original_image_url.like.storage://photo-history/*,result_image_url.like.storage://photo-history/*");

      if (storageSelectError) {
        console.error("cleanup storage select error:", storageSelectError);
        storageErrors += 1;
      }

      const storageResult = await removeStorageObjects(adminClient, (storagePhotos || []) as PhotoRow[]);
      removedStorageObjects += storageResult.removed;
      if (storageResult.error) {
        storageErrors += 1;
      }
    }

    const photoIds = photos.map((photo) => photo.id);
    const { error: deleteError } = await adminClient.from("photo_history").delete().in("id", photoIds);

    if (deleteError) {
      console.error("cleanup delete error:", deleteError);
      throw deleteError;
    }

    removedPhotos += photos.length;

    if (photos.length < batchSize) {
      break;
    }
  }

  return {
    mode,
    removedPhotos,
    removedStorageObjects,
    storageErrors,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: securityHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Missing Supabase configuration" }, 500);
    }

    const authMode: CleanupAuthMode = await isAdminRequest(req, supabaseUrl, anonKey);
    if (authMode === "none") {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "all" ? "all" : "expired";

    if (mode === "all" && authMode !== "admin") {
      return json({ error: "Admin session required for destructive cleanup" }, 403);
    }

    if (mode === "all" && body?.confirm !== "DELETE_ALL_PHOTOS") {
      return json({ error: "Missing destructive cleanup confirmation" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const result = await cleanupPhotos(adminClient, mode);

    console.log("cleanup-expired-photos result:", result);

    return json({ success: true, ...result });
  } catch (error) {
    console.error("cleanup-expired-photos error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
