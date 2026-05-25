# Cardápio Pro IA

Aplicação web para transformar fotos simples de pratos em imagens mais profissionais usando IA, com histórico por sessão e armazenamento permanente para usuários autenticados.

## Stack

- `React 18` + `Vite` + `TypeScript`
- `Tailwind CSS` + componentes `shadcn/ui`
- `Supabase` para autenticação, banco e edge functions
- `React Query` para cache de dados
- `Vitest` + `Testing Library` para testes unitários

## Requisitos

- `Node.js 20+`
- Projeto Supabase configurado
- Chaves `GEMINI_API_KEY` e `GECKO_API_KEY` configuradas nas edge functions do Supabase

## Variáveis de ambiente

Crie um `.env` local a partir de `.env.example`:

```bash
cp .env.example .env
```

Variáveis usadas no frontend:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Variáveis esperadas nas edge functions:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `GECKO_API_KEY`
- `ALLOWED_ORIGIN`
- `APP_URL`
- `SITE_URL`
- `KIWIFY_WEBHOOK_SECRET`
- `FREE_TRIAL_IP_SALT`
- `CLEANUP_PHOTOS_TOKEN`

## Como rodar

```bash
npm install
npm run dev
```

App local padrão: `http://localhost:5173`. Use `npm run dev -- --port 3008` quando quiser abrir em `http://localhost:3008`.

## Banco e segurança

As migrations em `supabase/migrations` criam:

- a tabela `photo_history`
- políticas RLS para usuários autenticados
- acesso anônimo vinculado ao header `x-session-id`
- deleção limitada ao dono da foto

Depois de atualizar as migrations, aplique-as no projeto Supabase antes de subir o frontend.
Links de confirmação/redefinição do Supabase Auth usam `auth.email.otp_expiry = 86400` em `supabase/config.toml` (24 horas).

## Scripts úteis

```bash
npm run dev
npm run build
npm run lint
npm test
```

## Testes adicionados

Os testes cobrem os pontos mais sensíveis desta revisão:

- headers de sessão e auth para chamadas ao Supabase
- slider antes/depois nas bordas
- fluxo em que a IA gera a imagem, mas o salvamento no histórico falha

## Estrutura principal

- `src/pages/MelhorarFotos.tsx`: fluxo principal de geração e salvamento
- `src/components/PhotoHistory.tsx`: listagem e exclusão do histórico
- `src/contexts/AuthContext.tsx`: sessão/autenticação
- `supabase/functions/process-food-image`: processamento com Gemini
- `supabase/functions/import-ifood-menu`: importa itens com imagem de uma loja do iFood via GeckoAPI
- `supabase/functions/delete-photo`: exclusão respeitando contexto do usuário/sessão

## Observações

- Fotos expiram em 24 horas e devem ser removidas pela função agendada `cleanup-expired-photos`.
- Usuários autenticados usam créditos por plano; administradores podem gerar sem debitar créditos.
- O frontend envia `x-session-id` automaticamente nas chamadas auxiliares quando necessário.
