// ============================================================================
//  REGRAS DE AGENDAMENTO (junta banco + horários + config)
//  Usado tanto pela agenda (API) quanto pelo bot do WhatsApp — assim os dois
//  seguem exatamente as mesmas regras e enxergam os mesmos dados.
// ============================================================================

const db = require('./db');
const slots = require('./slots');
const config = require('../config');

function servicoPorId(id) {
  return config.servicos.find((s) => s.id === id) || null;
}

function listarServicos() {
  return config.servicos;
}

// Próximos dias com vaga para um serviço
function diasDisponiveis(servicoId, agora = new Date()) {
  const s = servicoPorId(servicoId);
  if (!s) return [];
  const agendamentos = db.listarAgendamentos({ status: 'confirmado' });
  const bloqueios = db.listarBloqueios();
  return slots.proximosDiasComVaga(s.duracaoMin, agendamentos, config, agora, bloqueios);
}

// Horários livres de um serviço num dia
function horariosDisponiveis(servicoId, dataStr, agora = new Date()) {
  const s = servicoPorId(servicoId);
  if (!s) return [];
  const agendamentos = db.listarAgendamentos({ status: 'confirmado' });
  const bloqueios = db.listarBloqueios();
  return slots.horariosDisponiveis(dataStr, s.duracaoMin, agendamentos, config, agora, bloqueios);
}

// Tenta criar um agendamento com todas as validações.
// Retorna { ok: true, agendamento } ou { ok: false, erro: 'mensagem' }
function agendar({ servicoId, data, hora, cliente, telefone, origem }, agora = new Date()) {
  const s = servicoPorId(servicoId);
  if (!s) return { ok: false, erro: 'Serviço inválido.' };
  if (!data || !hora) return { ok: false, erro: 'Data ou horário não informados.' };
  if (!cliente || !cliente.trim()) return { ok: false, erro: 'Nome do cliente é obrigatório.' };

  // Dia travado pelo barbeiro (folga/imprevisto)
  if (db.diaBloqueado(data)) {
    return { ok: false, erro: 'Esse dia não está disponível para agendamentos. Escolha outra data, por favor.' };
  }

  // Limite de agendamentos futuros por cliente (anti-abuso), só via WhatsApp/telefone
  if (telefone) {
    const hoje = slots.dataLocalISO(agora);
    const futuros = db
      .listarAgendamentos({ status: 'confirmado', telefone })
      .filter((a) => a.data >= hoje);
    if (futuros.length >= config.regras.maxAgendamentosPorCliente) {
      return {
        ok: false,
        erro: `Você já tem ${futuros.length} horário(s) marcado(s). Cancele um antes de marcar outro.`,
      };
    }
  }

  // O horário ainda está livre? (revalida para evitar dois clientes pegando o mesmo)
  const livres = horariosDisponiveis(servicoId, data, agora);
  if (!livres.includes(hora)) {
    return { ok: false, erro: 'Esse horário acabou de ficar indisponível. Escolha outro, por favor.' };
  }

  const agendamento = db.criarAgendamento({
    cliente: cliente.trim(),
    telefone: telefone || null,
    servicoId: s.id,
    servicoNome: s.nome,
    data,
    hora,
    duracaoMin: s.duracaoMin,
    origem: origem || 'agenda',
  });
  return { ok: true, agendamento };
}

function agendamentosDoCliente(telefone, agora = new Date()) {
  const hoje = slots.dataLocalISO(agora);
  return db
    .listarAgendamentos({ status: 'confirmado', telefone })
    .filter((a) => a.data >= hoje);
}

function cancelar(id) {
  const ag = db.cancelarAgendamento(id);
  return ag ? { ok: true, agendamento: ag } : { ok: false, erro: 'Agendamento não encontrado.' };
}

module.exports = {
  servicoPorId,
  listarServicos,
  diasDisponiveis,
  horariosDisponiveis,
  agendar,
  agendamentosDoCliente,
  cancelar,
};
