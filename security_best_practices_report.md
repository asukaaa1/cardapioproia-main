# Security Best Practices Report

## Executive Summary

I found 5 material security concerns in this codebase:

1. A critical migration bug that can grant `admin` to every user that already existed when the migration ran.
2. A high-risk webhook path that fails open when its secret is missing, allowing fake billing events to change credits and subscription state.
3. A medium-risk secret handling issue where the Gemini API key is sent in a URL query string.
4. A medium-risk session hardening gap: browser auth tokens are persisted in `localStorage` while the deployed CSP still allows inline script execution.
5. A low-to-medium dependency/tooling issue: the current dev toolchain has known advisories and the Vite dev server is bound to all interfaces.

I did **not** find a confirmed user-input-to-DOM XSS path in the React app during this pass. The only `dangerouslySetInnerHTML` usage I found appears to build CSS from component configuration rather than rendering user content.

## Critical Findings

### CR-01: Historical migration promotes every existing auth user to administrator

- Severity: Critical
- Location:
  - `supabase/migrations/20260410110000_add_user_profiles_and_admin_management.sql:63-78`
  - `supabase/migrations/20260412100000_harden_sensitive_table_rls.sql:50-187`
  - `supabase/functions/manage-users/index.ts:67-80`
- Evidence:

```sql
INSERT INTO public.user_profiles (user_id, email, full_name, role, is_active, is_affiliate, created_at, updated_at)
SELECT
  users.id,
  COALESCE(users.email, ''),
  NULLIF(users.raw_user_meta_data ->> 'full_name', ''),
  'admin',
  TRUE,
  FALSE,
  ...
FROM auth.users AS users
```

```ts
if (requesterProfile?.role !== "admin") {
  return json({ error: "Acesso restrito ao administrador" }, 403);
}
```

- Impact: Any account that existed before this migration can inherit full admin privileges, which later unlocks admin RLS paths and the privileged `manage-users` edge function.
- Why this matters:
  - The later hardened RLS migration explicitly trusts `public.current_user_is_admin()` for broad read/update/delete access on `user_profiles`, `photo_history`, `user_credits`, `user_subscriptions`, `download_events`, `prompts_config`, and `plan_configs`.
  - I do not see a corrective migration that downgrades unintended admins; `20260410113000_set_oitalofreitas_admin.sql` only adds one specific admin and does not remove any others.
- Fix:
  - Replace the migration logic so existing users are inserted with role `user`, not `admin`.
  - Run a one-time data repair to downgrade unintended admins in `public.user_profiles`.
  - Add a regression test or migration assertion that only explicitly allowlisted accounts can be admins.
- False positive notes:
  - If `auth.users` was empty except for the intended owner when this migration ran, the blast radius may have been limited. The source still contains the dangerous migration and there is no visible repair script.

## High Findings

### HI-01: Billing webhook fails open when the secret is missing

- Severity: High
- Location:
  - `supabase/functions/kiwify-webhook/index.ts:280-286`
  - `supabase/functions/kiwify-webhook/index.ts:422-467`
  - `supabase/functions/kiwify-webhook/index.ts:506-534`
- Evidence:

```ts
if (!expected) {
  console.warn("KIWIFY_WEBHOOK_SECRET não configurado; webhook aceito sem validação de token.");
  return true;
}
```

```ts
await adminClient
  .from("user_subscriptions")
  .upsert({ ... status: "active", credits_included: mappedPlan.credits ... })

await adminClient
  .from("user_credits")
  .upsert({ user_id: userId, credits: mappedPlan.credits, ... })
```

```ts
await adminClient
  .from("user_subscriptions")
  .update({ status: "canceled", updated_at: now })
  .eq("user_id", userId);
```

- Impact: If `KIWIFY_WEBHOOK_SECRET` is absent in any environment, an unauthenticated caller can forge paid/cancel/refund events to activate subscriptions, refill credits, or disable accounts.
- Fix:
  - Fail closed when `KIWIFY_WEBHOOK_SECRET` is missing.
  - Refuse to start processing and return `500` for misconfigured environments instead of accepting the event.
  - Add deployment checks so the function cannot be promoted without the required secret.
- False positive notes:
  - If every deployed environment always sets `KIWIFY_WEBHOOK_SECRET`, this exact path is not exploitable. The code still chooses an unsafe default and turns a config miss into a privilege boundary failure.

### HI-02: Webhook account-bootstrap flow can use caller-controlled origin for password reset links

- Severity: High
- Location:
  - `supabase/functions/kiwify-webhook/index.ts:229-234`
  - `supabase/functions/kiwify-webhook/index.ts:392-395`
  - `supabase/functions/kiwify-webhook/index.ts:280-286`
- Evidence:

```ts
const origin = req.headers.get("origin");
const appUrl = Deno.env.get("APP_URL") || origin || "https://cardapioproia.vercel.app";
const redirectTo = `${appUrl.replace(/\/$/, "")}/login`;
```

```ts
if (!userId && isPaidEvent(eventType)) {
  const created = await createUserForPurchase(adminClient, email, customerName, req);
}
```

- Impact: If `APP_URL` is missing, the function can generate password reset emails that point at an attacker-controlled origin supplied in the request. Combined with HI-01, a forged paid event can create users and send them reset links to attacker infrastructure.
- Fix:
  - Require `APP_URL` and reject requests when it is unset.
  - Never derive auth redirects from request headers on privileged endpoints.
  - Use a small allowlist of exact frontend origins for any auth redirect target.
- False positive notes:
  - If `APP_URL` is always set correctly, the hostile-origin fallback is not reached. The source still contains the unsafe fallback.

## Medium Findings

### ME-01: Gemini API key is sent in the request URL as well as a header

- Severity: Medium
- Location: `supabase/functions/process-food-image/index.ts:401-408`
- Evidence:

```ts
fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
  {
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
```

- Impact: Query-string secrets are more likely to leak into logs, traces, proxies, and debugging tools than header-only secrets.
- Fix:
  - Remove `?key=${GEMINI_API_KEY}` from the URL.
  - Send the key only in the `x-goog-api-key` header.
- False positive notes:
  - This does not expose the key directly to the browser, but it still expands accidental logging exposure on the server side.

### ME-02: Browser auth tokens are persisted in `localStorage` while CSP still allows inline scripts

- Severity: Medium
- Location:
  - `src/integrations/supabase/client.ts:12-17`
  - `vercel.json:7-8`
- Evidence:

```ts
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
```

```json
"Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; ..."
```

- Impact: Any future XSS or injected third-party script would be able to read persisted Supabase session tokens from `localStorage`. The current CSP does not provide a strong last line of defense because `script-src` still allows `'unsafe-inline'`.
- Fix:
  - Tighten the CSP and remove `'unsafe-inline'` if operationally possible.
  - Prefer the strongest session storage model available for your auth architecture, and treat `localStorage` tokens as highly sensitive.
  - Keep reviewing the app for DOM-XSS sinks before expanding features that render rich content.
- False positive notes:
  - I did not confirm an active XSS injection path in this pass. This finding is about blast radius and secure defaults.

## Low Findings

### LO-01: The current dev toolchain has known advisories, and the Vite dev server is exposed on all interfaces

- Severity: Low
- Location:
  - `package.json:87-88`
  - `vite.config.ts:11-22`
  - `npm audit --package-lock-only --json` run locally on 2026-04-13
- Evidence:

```json
"vercel": "^50.42.0",
"vite": "^5.4.19"
```

```ts
server: {
  host: "::",
  port: 8080,
  ...
}
```

- Impact:
  - `npm audit --package-lock-only` reported 34 advisories in the current dependency tree, including Vite/esbuild dev-server issues and multiple high-severity transitive issues through `vercel`.
  - Binding Vite to `::` makes the dev server reachable from the local network, which increases exposure if developers run it on untrusted networks.
- Fix:
  - Upgrade Vite and re-run `npm audit`.
  - Review whether `vercel` is needed as a local dependency.
  - Default the dev server to loopback unless LAN access is explicitly needed.
- False positive notes:
  - Most of these issues are dev/build-time rather than production runtime issues, but they still matter for developer workstation security and internal network exposure.

## Additional Observations

- `supabase/functions/manage-users/index.ts:10-15` uses `Access-Control-Allow-Origin: "*"` on a privileged admin function. This is not directly exploitable without an admin bearer token, but it unnecessarily widens browser-based abuse paths if that token is ever exposed.
- `supabase/functions/manage-users/index.ts:260-265` repeats the same `APP_URL || origin` redirect pattern seen in the Kiwify webhook and should be hardened the same way.
- `src/components/ui/chart.tsx:69-85` uses `dangerouslySetInnerHTML`, but the injected content is CSS generated from chart configuration rather than a clear user-controlled HTML sink. I am not counting it as a confirmed XSS finding from this scan.
