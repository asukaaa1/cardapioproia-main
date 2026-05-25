# Integração Kiwify + Supabase

Esta integração recebe webhooks da Kiwify, ativa planos, adiciona créditos e bloqueia usuários cancelados.

## Banco

Aplique a migration:

```bash
supabase db push
```

Ela cria:

- `public.user_credits`: saldo de créditos por usuário.
- `public.kiwify_webhook_events`: idempotência, auditoria e reconciliação.
- `public.debit_user_credit(...)`: débito atômico usado pela IA.

## Edge functions

Deploy das funções:

```bash
supabase functions deploy kiwify-webhook --no-verify-jwt
supabase functions deploy process-food-image
```

## Secrets

Configure no Supabase:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="sua-service-role-key"
supabase secrets set GEMINI_API_KEY="sua-chave-gemini"
supabase secrets set KIWIFY_WEBHOOK_SECRET="um-token-forte-criado-por-voce"
supabase secrets set ALLOWED_ORIGIN="https://cardapioproia.com.br,https://www.cardapioproia.com.br,https://cardapioproia.vercel.app"
supabase secrets set APP_URL="https://cardapioproia.com.br"
supabase secrets set SITE_URL="https://cardapioproia.com.br"
```

O `KIWIFY_WEBHOOK_SECRET` deve ser enviado pela Kiwify em um destes formatos:

- Header `x-webhook-token`
- Header `x-kiwify-token`
- Header `x-kiwify-signature`
- Header `Authorization: Bearer SEU_TOKEN`
- Campo `token` no JSON, se a Kiwify enviar o token dentro do payload

## URL do webhook na Kiwify

Use:

```text
https://SEU_PROJECT_REF.supabase.co/functions/v1/kiwify-webhook
```

Eventos tratados:

- `order.paid`
- `order_approved`
- `paid`
- `subscription.canceled`
- `order.refunded`
- `chargeback`
- `refund`

## Mapeamento de planos

- Produto/link contendo `bronze` ou o código do checkout Bronze: plano `bronze`, `40` créditos.
- Produto/link contendo `prata` ou o código do checkout Prata: plano `prata`, `120` créditos.
- Produto/link contendo `ouro` ou o código do checkout Ouro: plano `ouro`, `250` créditos.
- Produto contendo `Pro`: plano legado `pro`, `100` créditos.
- Produto contendo `Ilimitado`: plano legado `ilimitado`, `999999` créditos.

## Regras de crédito

- A função `process-food-image` exige usuário autenticado.
- Antes de gerar, valida assinatura cancelada e saldo.
- Se `credits <= 0`, retorna `403` com `Sem créditos disponíveis`.
- Após gerar imagem com sucesso, debita `1` crédito via função SQL atômica.

## Primeiro acesso

Se o comprador da Kiwify ainda não existir em `user_profiles`, a função cria automaticamente:

- usuário no Supabase Auth;
- perfil em `user_profiles`;
- assinatura ativa;
- saldo em `user_credits`.

Depois disso, envia um e-mail de redefinição de senha para o comprador definir o acesso.

Eventos de cancelamento/reembolso/chargeback para usuários inexistentes continuam salvos como `user_not_found`, pois não há conta para bloquear.
