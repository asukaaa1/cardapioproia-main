CREATE TABLE IF NOT EXISTS public.plan_configs (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_label TEXT NOT NULL DEFAULT 'R$ 0',
  period_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits >= 0),
  checkout_url TEXT,
  cta_label TEXT NOT NULL DEFAULT 'Assinar',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  kiwify_product_keywords TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_plan_code_check;

ALTER TABLE public.user_subscriptions
DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;

ALTER TABLE public.plan_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active plan configs" ON public.plan_configs;
CREATE POLICY "Anyone can view active plan configs"
ON public.plan_configs
FOR SELECT
USING (is_active = TRUE OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins can manage plan configs" ON public.plan_configs;
CREATE POLICY "Admins can manage plan configs"
ON public.plan_configs
FOR ALL
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE OR REPLACE FUNCTION public.set_plan_configs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_plan_configs_updated_at ON public.plan_configs;
CREATE TRIGGER trg_set_plan_configs_updated_at
BEFORE UPDATE ON public.plan_configs
FOR EACH ROW
EXECUTE FUNCTION public.set_plan_configs_updated_at();

INSERT INTO public.plan_configs (
  code,
  name,
  price_label,
  period_label,
  description,
  credits,
  checkout_url,
  cta_label,
  features,
  kiwify_product_keywords,
  is_active,
  is_popular,
  sort_order
)
VALUES
  (
    'free',
    'Gratuito',
    'R$ 0',
    '',
    'Para experimentar a plataforma',
    5,
    NULL,
    'Plano atual',
    '["5 fotos por mês", "Armazenamento por 24h", "Padrões básicos de estilo"]'::jsonb,
    ARRAY['gratuito', 'free'],
    TRUE,
    FALSE,
    10
  ),
  (
    'pro',
    'Pro',
    'R$ 49',
    '/mês',
    'Para restaurantes e deliveries ativos',
    100,
    'https://dashboard.kiwify.com.br/',
    'Assinar Pro',
    '["100 fotos por mês", "Armazenamento permanente", "Todos os padrões de estilo", "Ajustes de brilho e contraste", "Suporte prioritário"]'::jsonb,
    ARRAY['pro'],
    TRUE,
    TRUE,
    20
  ),
  (
    'ilimitado',
    'Ilimitado',
    'R$ 99',
    '/mês',
    'Para redes e alto volume',
    999999,
    'https://dashboard.kiwify.com.br/',
    'Assinar Ilimitado',
    '["Fotos ilimitadas", "Armazenamento permanente", "Todos os padrões de estilo", "Ajustes avançados", "API de integração em breve", "Suporte dedicado"]'::jsonb,
    ARRAY['ilimitado', 'unlimited'],
    TRUE,
    FALSE,
    30
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  price_label = EXCLUDED.price_label,
  period_label = EXCLUDED.period_label,
  description = EXCLUDED.description,
  credits = EXCLUDED.credits,
  checkout_url = COALESCE(public.plan_configs.checkout_url, EXCLUDED.checkout_url),
  cta_label = EXCLUDED.cta_label,
  features = EXCLUDED.features,
  kiwify_product_keywords = EXCLUDED.kiwify_product_keywords,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
