// ============================================================================
//  BOT DE WHATSAPP (whatsapp-web.js)
//  Conecta no WhatsApp do barbeiro via QR Code e responde os clientes,
//  marcando os horários no MESMO banco que a agenda usa.
//
//  Importante: usa uma biblioteca NÃO-oficial (whatsapp-web.js), que controla
//  o WhatsApp Web. Funciona bem para um negócio pequeno, mas a Meta pode
//  bloquear números que enviam muitas mensagens automáticas. Use com bom senso.
// ============================================================================

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

function iniciarBot() {
  // Carrega whatsapp-web.js só aqui dentro para o resto do projeto rodar
  // (testes, servidor) mesmo sem essa dependência instalada.
  let Client, LocalAuth;
  try {
    ({ Client, LocalAuth } = require('whatsapp-web.js'));
  } catch (e) {
    console.error('\n⚠️  whatsapp-web.js não está instalado. Rode "npm install" antes.\n');
    botState.definir({ status: 'desligado' });
    return null;
  }

  botState.definir({ status: 'iniciando', qr: null });

  const puppeteer = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  // Em servidores, usamos o Chromium do sistema (definido por variável de ambiente).
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
    qrcode.generate(qr, { small: true }); // também mostra no terminal, por conveniência
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

  client.on('message', async (msg) => {
    try {
      // Ignora grupos, status e mensagens do próprio número
      if (msg.from.endsWith('@g.us') || msg.from === 'status@broadcast') return;
      if (msg.fromMe) return;

      const telefone = msg.from; // ex.: "5511999999999@c.us"
      const texto = msg.body || '';

      const sessao = db.obterSessao(telefone);
      const { reply, session } = handleMessage(sessao, texto, telefone, api, new Date());

      if (session) db.salvarSessao(telefone, session);
      else db.limparSessao(telefone);

      if (reply) await msg.reply(reply);
    } catch (e) {
      console.error('[bot] Erro ao processar mensagem:', e);
    }
  });

  client.initialize().catch((e) => {
    console.error('[bot] Erro ao inicializar:', e.message);
    botState.definir({ status: 'desconectado', qr: null });
  });

  return client;
}

if (require.main === module) {
  iniciarBot();
}

module.exports = { iniciarBot, api };
