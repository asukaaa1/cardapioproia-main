ALTER TABLE public.plan_configs
ADD COLUMN IF NOT EXISTS show_on_landing BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.plan_configs
SET
  price_label = 'R$ 47,00',
  credits = 40,
  checkout_url = 'https://pay.kiwify.com.br/hHvVb5I',
  features = '["40 fotos", "Padrões básicos de estilo"]'::jsonb,
  kiwify_product_keywords = ARRAY[
    'bronze',
    'hhvvb5i',
    'hhvb5i',
    'https://pay.kiwify.com.br/hhvvb5i'
  ],
  show_on_landing = TRUE,
  updated_at = NOW()
WHERE code = 'bronze';

UPDATE public.plan_configs
SET
  price_label = 'R$ 97,00',
  credits = 120,
  checkout_url = 'https://pay.kiwify.com.br/EtTCVQN',
  features = '["120 fotos", "Todos os padrões de estilo", "Ajustes de brilho e contraste"]'::jsonb,
  kiwify_product_keywords = ARRAY[
    'prata',
    'ettcvqn',
    'https://pay.kiwify.com.br/ettcvqn'
  ],
  show_on_landing = TRUE,
  updated_at = NOW()
WHERE code = 'prata';

UPDATE public.plan_configs
SET
  price_label = 'R$ 297,00',
  credits = 250,
  checkout_url = 'https://pay.kiwify.com.br/z026oYE',
  features = '["250 fotos", "Todos os padrões de estilo", "Ajustes de brilho e contraste", "Suporte priorizado"]'::jsonb,
  kiwify_product_keywords = ARRAY[
    'ouro',
    'z026oye',
    'https://pay.kiwify.com.br/z026oye'
  ],
  show_on_landing = TRUE,
  updated_at = NOW()
WHERE code = 'ouro';

UPDATE public.plan_configs
SET show_on_landing = FALSE, updated_at = NOW()
WHERE code = 'free';
