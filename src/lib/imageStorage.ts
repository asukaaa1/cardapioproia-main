import { supabase } from "@/integrations/supabase/client";

const PRIVATE_PHOTO_BUCKET = "photo-history";
const STORAGE_REF_PREFIX = `storage://${PRIVATE_PHOTO_BUCKET}/`;

function getDataUrlInfo(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    throw new Error("Imagem inválida para armazenamento.");
  }

  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

  return {
    blob: new Blob([bytes], { type: mimeType }),
    extension,
    mimeType,
  };
}

export function isPrivateStorageRef(value: string | null | undefined) {
  return Boolean(value?.startsWith(STORAGE_REF_PREFIX));
}

export function getStoragePathFromRef(value: string) {
  return value.replace(STORAGE_REF_PREFIX, "");
}

export async function uploadHistoryImage(dataUrl: string, userId: string, photoId: string, kind: "original" | "result") {
  const { blob, extension, mimeType } = getDataUrlInfo(dataUrl);
  const path = `${userId}/${photoId}/${kind}.${extension}`;

  const { error } = await supabase.storage
    .from(PRIVATE_PHOTO_BUCKET)
    .upload(path, blob, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw error;

  return `${STORAGE_REF_PREFIX}${path}`;
}

export async function resolveImageUrl(value: string) {
  if (!isPrivateStorageRef(value)) return value;

  const { data, error } = await supabase.storage
    .from(PRIVATE_PHOTO_BUCKET)
    .createSignedUrl(getStoragePathFromRef(value), 60 * 60);

  if (error || !data?.signedUrl) {
    console.error("Signed image URL error:", error);
    return "";
  }

  return data.signedUrl;
}
