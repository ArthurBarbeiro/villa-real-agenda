// ============================================================================
//  ESTADO DO BOT DE WHATSAPP (compartilhado entre o bot e o servidor web)
//  Guarda o status da conexão e o último QR Code, para a tela protegida
//  "Conexão do WhatsApp" poder exibir o QR e dizer se está conectado.
// ============================================================================

const estado = {
  status: 'desligado', // 'desligado' | 'iniciando' | 'qr' | 'conectado' | 'desconectado'
  qr: null,            // string do QR Code (quando status = 'qr')
  numero: null,        // número conectado (quando conectado)
  atualizadoEm: null,
};

function definir(novo) {
  Object.assign(estado, novo);
  estado.atualizadoEm = new Date().toISOString();
}

function obter() {
  return { ...estado };
}

module.exports = { definir, obter };
