# 🔧 Configuração do Replicate para Geração de Imagens

## Problema Corrigido
O Gemini não gera imagens. Agora usamos **Replicate API** com **SDXL** (Stable Diffusion XL) que é muito melhor para gerar fotos de comida.

## Solução

### 1. Criar Conta no Replicate
1. Acesse: https://replicate.com
2. Clique em "Sign up"
3. Faça login com GitHub ou email
4. Vá em "Account" > "API tokens"
5. Clique "Create token"
6. Copie o token gerado

### 2. Configurar no Supabase
Execute no terminal:
```bash
supabase secrets set REPLICATE_API_TOKEN=seu-token-aqui
```

Ou via dashboard do Supabase:
1. Acesse: https://app.supabase.com
2. Seu projeto → Edge Functions → Secrets
3. Clique "New Secret"
4. Nome: `REPLICATE_API_TOKEN`
5. Valor: seu token do Replicate
6. Salve

### 3. Deploy da Edge Function
Depois de configurar os secrets:
```bash
supabase functions deploy process-food-image
```

## Como Funciona
- **Modelo:** SDXL (Stable Diffusion XL)
- **API:** Replicate
- **Tempo:** ~30-60 segundos por imagem
- **Qualidade:** Excelente para fotos de comida

## Verificar se está funcionando
1. Abra a página "Melhorar Fotos" no app
2. Envie uma foto
3. Clique em "Gerar foto"
4. Aguarde 30-60 segundos
5. A imagem gerada deve aparecer

### Erros comuns
- **"service not configured"** → Configure o secret `REPLICATE_API_TOKEN` no Supabase
- **"API Error: 401"** → O token Replicate está inválido
- **Timeout** → A geração está demorando (normal, espere mais)
- **"No image generated"** → Tente com prompt mais específico

## Links Úteis
- Replicate: https://replicate.com
- SDXL Model: https://replicate.com/stability-ai/sdxl
- Pricing: https://replicate.com/pricing

## Dicas de Uso
- Primeiras gerações podem levar mais tempo
- Para combos: descreva os itens específicos
- Para presets: use descritores de estilo
- Feedback: seja bem específico no que quer mudar
