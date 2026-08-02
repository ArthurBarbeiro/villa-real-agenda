// ============================================================================
//  BOT DE WHATSAPP (whatsapp-web.js)
//  Conecta no WhatsApp do barbeiro via QR Code e responde os clientes,
//  marcando os horários no MESMO banco que a agenda usa.
//
//  Importante: usa uma biblioteca NÃO-oficial (whatsapp-web.js), que controla
//  o WhatsApp Web. Funciona bem para um negócio pequeno, mas a Meta pode
//  bloquear números que enviam muitas mensagens automáticas. Use com bom senso.
// ============================================================================

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
const botState = require('./botState');
const { handleMessage } = require('./conversation');

// "api" que a máquina de conversa usa (injeção de dependência)
const api = {
  listarServicos: booking.listarServicos,
  servicoPorId: booking.servicoPorId,
  diasDisponiveis: booking.diasDisponiveis,
  horariosDisponiveis: booking.horariosDisponiveis,
  agendar: booking.agendar,
  agendamentosDoCliente: booking.agendamentosDoCliente,
  cancelar: booking.cancelar,
  obterCliente: db.obterCliente,
};

// Onde guardar a sessão do WhatsApp (para não precisar reescanear o QR).
// Usa o DATA_DIR (disco persistente na hospedagem) quando definido.
function pastaAuth() {
  const base = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(base, '.wwebjs_auth');
}

// Remove arquivos de "trava" do Chromium que podem sobrar de um container
// anterior (causam o erro "profile appears to be in use by another process").
function limparTravas() {
  const alvos = ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'];
  function varrer(dir) {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const it of itens) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) varrer(p);
      else if (alvos.includes(it.name)) { try { fs.unlinkSync(p); } catch (_) {} }
    }
  }
  varrer(pastaAuth());
}

function montarClient(Client, LocalAuth) {
  const puppeteer = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    puppeteer.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: pastaAuth() }),
    puppeteer,
  });

  client.on('qr', (qr) => {
    botState.definir({ status: 'qr', qr });
    console.log('\n📱 Novo QR Code gerado. Abra a tela "Conexão do WhatsApp" no app para escanear.');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => {
    console.log('🔐 WhatsApp autenticado!');
    botState.definir({ status: 'iniciando', qr: null });
  });

  client.on('ready', () => {
    const numero = client.info && client.info.wid ? client.info.wid.user : null;
    console.log('✅ Bot do WhatsApp conectado e pronto para atender!\n');
    botState.definir({ status: 'conectado', qr: null, numero });
  });

  client.on('auth_failure', (m) => {
    console.error('❌ Falha de autenticação:', m);
    botState.definir({ status: 'desconectado', qr: null });
  });

  client.on('disconnected', (r) => {
    console.warn('🔌 WhatsApp desconectado:', r);
    botState.definir({ status: 'desconectado', qr: null, numero: null });
  });

  async function processarMensagem(msg) {
    try {
      if (!msg || msg.fromMe) return;                       // ignora o que o próprio bot envia
      if (typeof msg.from !== 'string') return;
      if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return; // ignora grupos/status
      if (!msg.from.endsWith('@c.us')) return;              // só conversa individual

      const telefone = msg.from;
      const texto = msg.body || '';
      console.log('[bot] Mensagem recebida de ' + telefone + ': ' + JSON.stringify(texto));

      const sessao = db.obterSessao(telefone);
      const { reply, session } = handleMessage(sessao, texto, telefone, api, new Date());
      if (session) db.salvarSessao(telefone, session);
      else db.limparSessao(telefone);

      if (reply) {
        await client.sendMessage(telefone, reply);
        console.log('[bot] Respondi ' + telefone);
      }
    } catch (e) {
      console.error('[bot] Erro ao processar mensagem:', (e && e.message) ? e.message : e);
    }
  }

  // "message_create" é o evento mais confiável nas versões novas (pega recebidas e enviadas;
  // filtramos as enviadas pelo próprio bot com msg.fromMe acima).
  client.on('message_create', processarMensagem);

  return client;
}

function iniciarBot() {
  let Client, LocalAuth;
  try {
    ({ Client, LocalAuth } = require('whatsapp-web.js'));
  } catch (e) {
    console.error('\n⚠️  whatsapp-web.js não está instalado. Rode "npm install" antes.\n');
    botState.definir({ status: 'desligado' });
    return null;
  }

  let tentativa = 0;
  const MAX = 8;

  async function tentar() {
    tentativa++;
    botState.definir({ status: 'iniciando', qr: null });
    limparTravas(); // remove locks de container anterior
    const client = montarClient(Client, LocalAuth);
    try {
      await client.initialize();
    } catch (e) {
      console.error(`[bot] Erro ao inicializar (tentativa ${tentativa}/${MAX}):`, e.message);
      try { await client.destroy(); } catch (_) {}
      if (tentativa < MAX) {
        const espera = Math.min(5000 * tentativa, 30000);
        console.log(`[bot] Tentando de novo em ${Math.round(espera / 1000)}s…`);
        botState.definir({ status: 'iniciando', qr: null });
        setTimeout(tentar, espera);
      } else {
        console.error('[bot] Não consegui iniciar o WhatsApp após várias tentativas.');
        botState.definir({ status: 'desconectado', qr: null });
      }
    }
  }

  tentar();
  return true;
}

if (require.main === module) {
  iniciarBot();
}

module.exports = { iniciarBot, api };
