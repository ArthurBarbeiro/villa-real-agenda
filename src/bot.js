// ============================================================================
//  BOT DE WHATSAPP (Baileys)
//  Conecta no WhatsApp do barbeiro e responde os clientes, marcando os
//  horários no MESMO banco que a agenda usa.
//
//  Usa o Baileys, que fala DIRETO com o WhatsApp (sem navegador/Chromium).
//  É mais leve e estável em servidor. Ainda é uma solução não-oficial, então
//  use com bom senso (a Meta pode bloquear números com muito disparo automático).
// ============================================================================

const fs = require('fs');
const path = require('path');
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
function pastaAuth() {
  const base = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  return path.join(base, 'baileys_auth');
}

// Extrai o texto de vários formatos de mensagem do WhatsApp
function textoDaMensagem(m) {
  const msg = m.message || {};
  return (
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    (msg.videoMessage && msg.videoMessage.caption) ||
    (msg.buttonsResponseMessage && msg.buttonsResponseMessage.selectedDisplayText) ||
    (msg.listResponseMessage && msg.listResponseMessage.title) ||
    ''
  );
}

async function iniciarBot() {
  let baileys, pino;
  try {
    baileys = await import('@whiskeysockets/baileys'); // Baileys é ESM
    pino = require('pino');
  } catch (e) {
    console.error('\n⚠️  Baileys não está instalado. Rode "npm install".', e && e.message);
    botState.definir({ status: 'desligado' });
    return null;
  }

  const makeWASocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

  botState.definir({ status: 'iniciando', qr: null });

  const { state, saveCreds } = await useMultiFileAuthState(pastaAuth());

  // Pega a versão atual do WhatsApp Web automaticamente (evita quebrar a cada update)
  let version;
  try { ({ version } = await fetchLatestBaileysVersion()); } catch (_) { version = undefined; }

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Villa Real', 'Chrome', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      botState.definir({ status: 'qr', qr });
      console.log('📱 Novo QR Code gerado. Abra a tela "Conexão do WhatsApp" no app para escanear.');
    }
    if (connection === 'open') {
      const numero = sock.user && sock.user.id ? String(sock.user.id).split(':')[0].split('@')[0] : null;
      botState.definir({ status: 'conectado', qr: null, numero });
      console.log('✅ Bot do WhatsApp conectado e pronto para atender! (' + numero + ')');
    }
    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const deslogado = code === DisconnectReason.loggedOut;
      console.warn('🔌 Conexão fechada (código ' + code + '). Deslogado: ' + deslogado);
      if (deslogado) {
        // Sessão encerrada no celular: apaga a sessão para gerar um QR novo
        botState.definir({ status: 'desconectado', qr: null, numero: null });
        try { fs.rmSync(pastaAuth(), { recursive: true, force: true }); } catch (_) {}
        setTimeout(iniciarBot, 3000);
      } else {
        // Queda de conexão: reconecta sozinho
        botState.definir({ status: 'iniciando', qr: null });
        setTimeout(iniciarBot, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async (ev) => {
    try {
      if (ev.type !== 'notify') return;
      for (const m of ev.messages) {
        if (!m.message || (m.key && m.key.fromMe)) continue;
        const jid = (m.key && m.key.remoteJid) || '';
        if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) continue;

        const texto = textoDaMensagem(m);
        console.log('[bot] Mensagem de ' + jid + ': ' + JSON.stringify(texto));

        const sessao = db.obterSessao(jid);
        const { reply, session } = handleMessage(sessao, texto, jid, api, new Date());
        if (session) db.salvarSessao(jid, session);
        else db.limparSessao(jid);

        if (reply) {
          await sock.sendMessage(jid, { text: reply });
          console.log('[bot] Respondi ' + jid);
        }
      }
    } catch (e) {
      console.error('[bot] Erro ao processar mensagem:', (e && e.message) ? e.message : e);
    }
  });

  return sock;
}

if (require.main === module) {
  iniciarBot();
}

module.exports = { iniciarBot, api };
