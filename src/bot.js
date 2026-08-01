// ============================================================================
//  BOT DE WHATSAPP (whatsapp-web.js)
//  Conecta no WhatsApp do barbeiro via QR Code e responde os clientes,
//  marcando os horários no MESMO banco que a agenda usa.
//
//  Importante: usa uma biblioteca NÃO-oficial (whatsapp-web.js), que controla
//  o WhatsApp Web. Funciona bem para um negócio pequeno, mas a Meta pode
//  bloquear números que enviam muitas mensagens automáticas. Use com bom senso.
// ============================================================================

const qrcode = require('qrcode-terminal');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
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

function iniciarBot() {
  // Carrega whatsapp-web.js só aqui dentro para o resto do projeto rodar
  // (testes, servidor) mesmo sem essa dependência instalada.
  let Client, LocalAuth;
  try {
    ({ Client, LocalAuth } = require('whatsapp-web.js'));
  } catch (e) {
    console.error('\n⚠️  whatsapp-web.js não está instalado. Rode "npm install" antes.\n');
    return null;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: require('path').join(__dirname, '..', 'data', '.wwebjs_auth') }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('\n📱 Escaneie este QR Code com o WhatsApp do barbeiro:');
    console.log('   (WhatsApp > Aparelhos conectados > Conectar um aparelho)\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => console.log('🔐 WhatsApp autenticado!'));
  client.on('ready', () => console.log('✅ Bot do WhatsApp conectado e pronto para atender!\n'));
  client.on('auth_failure', (m) => console.error('❌ Falha de autenticação:', m));
  client.on('disconnected', (r) => console.warn('🔌 WhatsApp desconectado:', r));

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

  client.initialize();
  return client;
}

if (require.main === module) {
  iniciarBot();
}

module.exports = { iniciarBot, api };
