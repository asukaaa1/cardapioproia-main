export function getEdgeFunctionUrl(functionName: string) {
  if (import.meta.env.DEV) {
    return `/api/functions/${functionName}`;
  }

  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;
}
