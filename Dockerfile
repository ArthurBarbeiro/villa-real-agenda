# ============================================================================
#  Imagem para rodar a agenda + o bot de WhatsApp (Baileys).
#  Não precisa de Chromium/navegador — o Baileys fala direto com o WhatsApp.
# ============================================================================
FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
