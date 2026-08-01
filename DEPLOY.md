# 🚀 Como publicar a agenda da Villa Real online

Este guia coloca **o app de agendamento no ar** com um link público (ex.:
`villa-real-agenda.up.railway.app`) para você mandar aos clientes. O WhatsApp
continua **manual** nesta fase (você mesmo agenda, como já faz) — o bot
automático fica para a Fase 2, mais para frente.

Você **não precisa saber programar**. É seguir os cliques abaixo.

---

## Opção A — Railway (recomendada: os agendamentos NÃO se perdem)

### Parte 1 — Colocar o código no GitHub (uma vez só)
1. Crie uma conta grátis em https://github.com (se ainda não tiver).
2. Clique em **New repository** (botão verde). Dê um nome, ex.: `villa-real-agenda`.
   Deixe como **Public** ou **Private** (tanto faz) e clique **Create repository**.
3. Na página que abrir, clique no link **"uploading an existing file"**.
4. **Descompacte** o arquivo `barbearia-agenda.zip` no seu computador e **arraste
   para a página TODOS os arquivos e pastas de dentro** (config.js, package.json,
   as pastas `src`, `public`, etc.).
   > ⚠️ Se aparecer uma pasta chamada `node_modules`, **não suba ela** (é pesada e
   > desnecessária). O zip que te enviei já vem sem ela, então é só não recriá-la.
5. Clique em **Commit changes**. Pronto, o código está no GitHub.

### Parte 2 — Publicar no Railway
1. Entre em https://railway.app e clique em **Login** → **Login with GitHub**
   (usa a conta que você acabou de criar).
2. Clique em **New Project** → **Deploy from GitHub repo** → escolha o repositório
   `villa-real-agenda`. O Railway reconhece que é um app Node e já começa o deploy.
3. Quando terminar, clique no serviço e vá em **Variables**. Adicione estas três:
   - `SEM_BOT` = `1`
   - `PUPPETEER_SKIP_DOWNLOAD` = `1`
   - `DATA_DIR` = `/data`
4. Ainda no serviço, adicione um **Volume** (é o "HD" que guarda os agendamentos):
   clique com o botão direito no serviço → **Add Volume** (ou aba **Settings →
   Volumes**) e defina o **Mount path** como `/data`.
5. Vá em **Settings → Networking → Generate Domain**. O Railway cria a URL pública.
   **Essa URL é o link do seu app** 🎉
6. Se você adicionou as variáveis/volume depois do primeiro deploy, clique em
   **Deploy / Redeploy** para aplicar.

> 💳 **Custo:** o Railway dá um crédito de teste ao criar a conta. Depois, um app
> pequeno como esse costuma custar poucos dólares por mês (uso baixo). Dá pra
> começar testando com o crédito grátis.

---

## Opção B — Render (100% grátis para testar, porém com ressalvas)

Bom para **experimentar sem pagar nada**, mas: (1) o app "dorme" após uns minutos
sem uso e demora ~30s para acordar na primeira visita; (2) no plano grátis os
agendamentos podem ser **zerados** quando você atualiza o app. Para teste, serve.

1. Suba o código no GitHub (igual à Parte 1 da Opção A).
2. Crie conta em https://render.com → **Login with GitHub**.
3. **New → Web Service** → conecte o repositório `villa-real-agenda`.
4. O Render lê o arquivo `render.yaml` que já vem no projeto e configura sozinho
   (start `node src/index.js`, com `SEM_BOT=1`). Clique **Create Web Service**.
5. Quando terminar, a URL pública aparece no topo da página do serviço.

---

## Depois de publicar

1. **Abra a URL no seu iPhone (Safari)** e teste: marque um horário na aba
   *Agendar* e confira se aparece na aba *Agenda*. Como agora é um site de verdade
   (e não um arquivo), abre liso no iPhone. ✅
2. **Coloque o link na sua mensagem de boas-vindas.** Sugestão de ajuste na sua
   mensagem:

   > Fala, meu amigo! 💈✂️
   > Seja muito bem-vindo à **Barbearia Villa Real**! Aqui o foco é te deixar na
   > régua, com estilo e autoestima lá em cima.
   > 👉 **Faça seu agendamento pelo nosso app:** SUA-URL-AQUI
   > Estamos na Av. Yervant Kissajikian, 1633A — em frente ao mercado Auyme, em
   > cima da Sodiê. Qualquer dúvida, é só chamar! 👊🔥

3. **Instale como app no celular:** aberta a URL, use *Compartilhar → Adicionar à
   Tela de Início*. Vira um ícone com o logo da Villa Real.

---

## Como atualizar o app depois (ex.: mudar preços/horários)
1. Edite o `config.js` no seu computador.
2. No GitHub, entre no arquivo → ícone de lápis (editar) → cole o novo conteúdo →
   **Commit changes**. O Railway/Render atualiza sozinho em 1–2 minutos.

---

## Fase 2 (mais para frente) — bot de WhatsApp automático 24h
Quando quiser que o bot responda sozinho, o caminho é rodar o sistema num
**servidor que fica ligado o tempo todo** (um VPS) e escanear o QR Code do
WhatsApp do Arthur. Aí é só remover a variável `SEM_BOT`. Me chama quando chegar
essa hora que eu te guio nessa parte.
