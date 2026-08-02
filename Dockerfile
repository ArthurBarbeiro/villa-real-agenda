# ============================================================================
#  Imagem para rodar a agenda + o bot de WhatsApp (com Chromium instalado).
#  Usada quando o bot está ligado (o whatsapp-web.js precisa de um navegador).
# ============================================================================
FROM node:20-slim

# Chromium + fontes + bibliotecas que o WhatsApp Web (puppeteer) precisa
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Usa o Chromium do sistema (não baixa outro)
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

CMD ["node", "src/index.js"]
