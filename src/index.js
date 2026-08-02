// ============================================================================
//  PONTO DE ENTRADA — sobe a agenda (web) e o bot de WhatsApp juntos.
//  Rode com:  npm start
// ============================================================================

process.env.TZ = process.env.TZ || 'America/Sao_Paulo'; // fuso de Brasília

const { iniciarServidor } = require('./server');
const { iniciarBot } = require('./bot');
const config = require('../config');

console.log('====================================================');
console.log(`   ${config.barbearia.nome} — Agenda + Bot WhatsApp`);
console.log('====================================================');

// 1) Servidor da agenda
iniciarServidor();

// 2) Bot do WhatsApp (mostra o QR Code no terminal na primeira vez)
const desativarBot = process.env.SEM_BOT === '1';
if (desativarBot) {
  console.log('ℹ️  Bot do WhatsApp desativado (SEM_BOT=1). Só a agenda está no ar.');
} else {
  iniciarBot();
}
