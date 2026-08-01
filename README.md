# ✂️ Agenda da Barbearia + Bot de WhatsApp

Sistema para o seu cabeleireiro **receber agendamentos pelo WhatsApp automaticamente**
e enxergar tudo numa **agenda que abre como app no celular**. O bot e a agenda
usam o mesmo banco de dados: quando um cliente marca pelo WhatsApp, aparece na
agenda na mesma hora; quando o barbeiro encaixa alguém na agenda, o horário some
para os clientes.

> **Antes de tudo:** abra o arquivo **`previa-barbearia.html`** (vem junto com a
> entrega) no navegador do seu celular. É uma demonstração que funciona sem
> instalar nada — dá para testar a agenda e conversar com o bot para sentir como
> fica. O projeto abaixo é a versão "de verdade", que conecta no WhatsApp real.

---

## O que você precisa (resumo rápido)

1. Um **computador** (ou um servidorzinho/VPS barato) para rodar o sistema. Pode
   ser o computador do próprio cabeleireiro — mas ele precisa ficar ligado no
   horário de funcionamento, porque é ele que responde o WhatsApp.
2. O **celular do cabeleireiro com o WhatsApp** que vai atender os clientes.
   O ideal é usar o **WhatsApp Business** dele. Na primeira vez você escaneia um
   QR Code (igual quando conecta o WhatsApp Web).
3. Cerca de 15 minutos para a instalação.

> ⚠️ **Importante sobre o WhatsApp:** este projeto usa a biblioteca
> `whatsapp-web.js`, que **não é oficial** da Meta (ela controla o WhatsApp Web
> por trás). Funciona muito bem para uma barbearia, mas a Meta pode bloquear
> números que disparam muita mensagem automática. Para um salão pequeno o risco é
> baixo. Se um dia o movimento crescer muito, dá para migrar para a **API oficial
> do WhatsApp Business** (o código da agenda continua igual, muda só a parte do bot).

---

## Instalação passo a passo

### 1) Instalar o Node.js
Baixe e instale o **Node.js versão 18 ou superior** em https://nodejs.org
(botão "LTS"). É só avançar/avançar/concluir.

### 2) Abrir o projeto
Descompacte a pasta `barbearia-agenda` num lugar fácil (ex.: a Área de Trabalho).
Abra o **Terminal** (Mac/Linux) ou o **Prompt de Comando / PowerShell** (Windows)
e entre na pasta:

```bash
cd caminho/para/barbearia-agenda
```

### 3) Instalar as dependências
```bash
npm install
```
> Se aparecer erro de download do "chromium/puppeteer" por causa da internet da
> empresa, rode assim (pula esse download problemático):
> ```bash
> # Windows (PowerShell):  $env:PUPPETEER_SKIP_DOWNLOAD=1 ; npm install
> # Mac/Linux:             PUPPETEER_SKIP_DOWNLOAD=1 npm install
> ```

### 4) Personalizar a barbearia
Abra o arquivo **`config.js`** num editor de texto e ajuste:
- nome da barbearia, nome do barbeiro e endereço;
- os **serviços** (nome, duração em minutos e preço);
- os **horários de funcionamento** de cada dia da semana;
- o telefone de contato (para a opção "falar com o barbeiro").

Não precisa mexer em mais nada.

### 5) Ligar o sistema
```bash
npm start
```
Vão acontecer duas coisas:
- A **agenda** ficará no ar em `http://localhost:3000`.
- Um **QR Code** aparecerá no terminal. No celular do cabeleireiro, abra o
  WhatsApp → **Aparelhos conectados** → **Conectar um aparelho** e escaneie.
  Depois de "✅ Bot conectado", o WhatsApp já está atendendo sozinho.

> A conexão do WhatsApp fica salva: nas próximas vezes que você rodar `npm start`
> não precisa escanear de novo.

### 6) Instalar a agenda no celular (como app)
No celular, abra `http://localhost:3000` (se o celular estiver na mesma rede do
computador, use o IP do computador, ex.: `http://192.168.0.10:3000`).
No navegador, use **"Adicionar à tela de início"**. Pronto: vira um ícone de app.

---

## Como funciona no dia a dia

**Para o cliente (WhatsApp):** ele manda qualquer mensagem para o número da
barbearia e o bot responde com um menu:
1. Marcar um horário → escolhe serviço → dia → horário → confirma.
2. Ver meus agendamentos.
3. Cancelar um agendamento.
4. Falar com o barbeiro (manda o contato direto).

**Para o barbeiro (app da agenda):**
- Aba **Agendar**: marca um cliente manualmente.
- Aba **Agenda**: vê os horários de cada dia, navega entre os dias, cancela e
  usa o botão **"Encaixar cliente"** para quem chegou no balcão.

---

## O que combinar com o cabeleireiro (a "tramitação")

- Qual **número de WhatsApp** ele vai usar para o bot (de preferência o
  WhatsApp Business, não o pessoal).
- Onde o sistema vai **ficar rodando** (o computador dele ligado no horário
  comercial, ou uma hospedagem/VPS para funcionar 24h).
- Os **serviços, preços e horários** reais dele (para preencher o `config.js`).
- Combinar que, enquanto o computador/servidor estiver **desligado**, o bot
  **não responde** — então vale deixar ligado no expediente ou usar uma
  hospedagem.

---

## Estrutura do projeto (para quem for mexer no código)

```
barbearia-agenda/
├── config.js            → tudo que você personaliza (serviços, horários, textos)
├── src/
│   ├── index.js         → liga a agenda + o bot juntos (npm start)
│   ├── server.js        → servidor web da agenda + API
│   ├── bot.js           → conexão com o WhatsApp (whatsapp-web.js)
│   ├── conversation.js  → o "cérebro" da conversa do bot (testado)
│   ├── booking.js       → regras de agendamento (usadas pela agenda e pelo bot)
│   ├── slots.js         → cálculo dos horários livres (testado)
│   └── db.js            → banco de dados (arquivo data/db.json)
├── public/              → a agenda (PWA): index.html, app.js, styles.css...
├── test/test.js         → testes automáticos (rode com: npm test)
└── data/                → onde os agendamentos e a sessão do WhatsApp ficam salvos
```

Rodar só a agenda, sem o bot (útil para testar):
```bash
SEM_BOT=1 npm start      # Mac/Linux
# Windows: $env:SEM_BOT=1 ; npm start
```

Rodar os testes:
```bash
npm test
```

---

## Próximos passos possíveis (evoluções futuras)
- Lembrete automático no dia anterior ("Seu horário é amanhã às 15h").
- Migração para a **API oficial do WhatsApp Business** (mais estável, permite
  volume maior).
- Hospedagem em nuvem para o sistema funcionar 24h sem depender do PC ligado.
- Login/senha na aba do barbeiro para separar do que o cliente vê.

Qualquer um desses dá para acrescentar depois — a base já está pronta.
