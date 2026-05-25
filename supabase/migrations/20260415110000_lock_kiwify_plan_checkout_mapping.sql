DELETE FROM public.plan_configs
WHERE code IN ('pro', 'ilimitado', 'unlimited');

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
    'bronze',
    'Bronze',
    'R$ 39,90',
    '/mês',
    'Plano inicial para padronizar fotos essenciais do cardápio',
    40,
    'https://pay.kiwify.com.br/hHvVb5I',
    'Assinar Bronze',
    '["40 fotos", "Padrões básicos de estilo"]'::jsonb,
    ARRAY['bronze', 'hhvvb5i', 'hhvb5i', 'https://pay.kiwify.com.br/hhvvb5i']::text[],
    TRUE,
    FALSE,
    20
  ),
  (
    'prata',
    'Prata',
    'R$ 97,00',
    '/mês',
    'Para cardápios com produção frequente e mais controle visual',
    120,
    'https://pay.kiwify.com.br/EtTCVQN',
    'Assinar Prata',
    '["120 fotos", "Todos os padrões de estilo", "Ajustes de brilho e contraste"]'::jsonb,
    ARRAY['prata', 'ettcvqn', 'https://pay.kiwify.com.br/ettcvqn']::text[],
    TRUE,
    TRUE,
    30
  ),
  (
    'ouro',
    'Ouro',
    'R$ 197,00',
    '/mês',
    'Para alto volume com prioridade no atendimento',
    250,
    'https://pay.kiwify.com.br/z026oYE',
    'Assinar Ouro',
    '["250 fotos", "Todos os padrões de estilo", "Ajustes de brilho e contraste", "Suporte priorizado"]'::jsonb,
    ARRAY['ouro', 'z026oye', 'https://pay.kiwify.com.br/z026oye']::text[],
    TRUE,
    FALSE,
    40
  )
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  price_label = EXCLUDED.price_label,
  period_label = EXCLUDED.period_label,
  description = EXCLUDED.description,
  credits = EXCLUDED.credits,
  checkout_url = EXCLUDED.checkout_url,
  cta_label = EXCLUDED.cta_label,
  features = EXCLUDED.features,
  kiwify_product_keywords = EXCLUDED.kiwify_product_keywords,
  is_active = EXCLUDED.is_active,
  is_popular = EXCLUDED.is_popular,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();
