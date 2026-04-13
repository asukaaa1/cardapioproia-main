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
- Chave `GEMINI_API_KEY` configurada nas edge functions do Supabase

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
- `ALLOWED_ORIGIN`

## Como rodar

```bash
npm install
npm run dev
```

App local padrão: `http://localhost:8080`

## Banco e segurança

As migrations em `supabase/migrations` criam:

- a tabela `photo_history`
- políticas RLS para usuários autenticados
- acesso anônimo vinculado ao header `x-session-id`
- deleção limitada ao dono da foto

Depois de atualizar as migrations, aplique-as no projeto Supabase antes de subir o frontend.

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
- `supabase/functions/delete-photo`: exclusão respeitando contexto do usuário/sessão

## Observações

- Usuários anônimos continuam com histórico por sessão.
- Usuários autenticados salvam fotos permanentemente.
- O frontend agora envia `x-session-id` automaticamente em todas as chamadas do cliente Supabase.
