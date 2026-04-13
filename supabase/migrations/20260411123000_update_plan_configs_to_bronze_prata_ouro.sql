DELETE FROM public.plan_configs
WHERE code IN ('pro', 'ilimitado');

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
    '["5 fotos por mês", "Armazenamento por 24h"]'::jsonb,
    ARRAY['gratuito', 'free'],
    TRUE,
    FALSE,
    10
  ),
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
    ARRAY['bronze', 'hHvVb5I'],
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
    ARRAY['prata', 'EtTCVQN'],
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
    ARRAY['ouro', 'z026oYE'],
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
