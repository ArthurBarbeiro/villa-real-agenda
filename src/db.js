// ============================================================================
//  BANCO DE DADOS SIMPLES (arquivo JSON)
//  Guarda agendamentos, clientes conhecidos e as conversas em andamento do bot.
//  Sem dependências externas: fácil de rodar em qualquer computador.
//  Para produção com muitos clientes, dá pra trocar por SQLite/Postgres depois.
// ============================================================================

const fs = require('fs');
const path = require('path');

// DATA_DIR pode ser definido por variável de ambiente (útil na hospedagem, para
// apontar para um disco/volume persistente e não perder os agendamentos).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = {
  agendamentos: [],   // { id, cliente, telefone, servicoId, servicoNome, data, hora, duracaoMin, status, origem, criadoEm }
  clientes: {},       // telefone -> { nome, telefone }
  sessoes: {},        // telefone -> { estado, dados, atualizadoEm }  (conversas do bot)
  bloqueios: [],      // dias travados: [{ data: 'YYYY-MM-DD', motivo, criadoEm }]
  contador: 1,        // gera ids sequenciais
};

function garantirArquivo() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function carregar() {
  garantirArquivo();
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Preenche chaves que possam faltar (compatibilidade)
    return { ...DEFAULT_DATA, ...data };
  } catch (e) {
    console.error('[db] Erro ao ler o banco, recriando vazio:', e.message);
    return { ...DEFAULT_DATA };
  }
}

function salvar(data) {
  garantirArquivo();
  // Escrita atômica: grava num temporário e renomeia (evita corromper o arquivo)
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

// ---- Operações de alto nível ----

function proximoId(data) {
  const id = data.contador || 1;
  data.contador = id + 1;
  return String(id);
}

function listarAgendamentos(filtro = {}) {
  const data = carregar();
  let lista = data.agendamentos;
  if (filtro.status) lista = lista.filter((a) => a.status === filtro.status);
  if (filtro.data) lista = lista.filter((a) => a.data === filtro.data);
  if (filtro.telefone) lista = lista.filter((a) => a.telefone === filtro.telefone);
  return lista.slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}

function criarAgendamento(dados) {
  const data = carregar();
  const id = proximoId(data);
  const ag = {
    id,
    cliente: dados.cliente,
    telefone: dados.telefone || null,
    servicoId: dados.servicoId,
    servicoNome: dados.servicoNome,
    data: dados.data,        // 'YYYY-MM-DD'
    hora: dados.hora,        // 'HH:MM'
    duracaoMin: dados.duracaoMin,
    status: 'confirmado',
    origem: dados.origem || 'agenda', // 'whatsapp' | 'agenda'
    criadoEm: new Date().toISOString(),
  };
  data.agendamentos.push(ag);
  if (dados.telefone) {
    data.clientes[dados.telefone] = { nome: dados.cliente, telefone: dados.telefone };
  }
  salvar(data);
  return ag;
}

function cancelarAgendamento(id) {
  const data = carregar();
  const ag = data.agendamentos.find((a) => a.id === String(id));
  if (!ag) return null;
  ag.status = 'cancelado';
  ag.canceladoEm = new Date().toISOString();
  salvar(data);
  return ag;
}

function obterCliente(telefone) {
  const data = carregar();
  return data.clientes[telefone] || null;
}

// ---- Bloqueio de dias (folgas / imprevistos) ----
// Um dia bloqueado não aparece para o cliente e não aceita novos agendamentos.
// Não cancela os agendamentos que já existiam nesse dia (o barbeiro decide isso).

function listarBloqueios() {
  const data = carregar();
  return (data.bloqueios || []).slice().sort((a, b) => a.data.localeCompare(b.data));
}

function diaBloqueado(dataStr) {
  const data = carregar();
  return (data.bloqueios || []).some((b) => b.data === dataStr);
}

function bloquearDia(dataStr, motivo) {
  const data = carregar();
  if (!data.bloqueios) data.bloqueios = [];
  const existente = data.bloqueios.find((b) => b.data === dataStr);
  if (existente) {
    existente.motivo = motivo || existente.motivo || '';
    salvar(data);
    return existente;
  }
  const bloqueio = { data: dataStr, motivo: motivo || '', criadoEm: new Date().toISOString() };
  data.bloqueios.push(bloqueio);
  salvar(data);
  return bloqueio;
}

function desbloquearDia(dataStr) {
  const data = carregar();
  const antes = (data.bloqueios || []).length;
  data.bloqueios = (data.bloqueios || []).filter((b) => b.data !== dataStr);
  if (data.bloqueios.length !== antes) { salvar(data); return true; }
  return false;
}

// ---- Sessões do bot (estado da conversa por telefone) ----

function obterSessao(telefone) {
  const data = carregar();
  return data.sessoes[telefone] || null;
}

function salvarSessao(telefone, sessao) {
  const data = carregar();
  data.sessoes[telefone] = { ...sessao, atualizadoEm: new Date().toISOString() };
  salvar(data);
}

function limparSessao(telefone) {
  const data = carregar();
  delete data.sessoes[telefone];
  salvar(data);
}

module.exports = {
  DB_FILE,
  carregar,
  salvar,
  listarAgendamentos,
  criarAgendamento,
  cancelarAgendamento,
  obterCliente,
  obterSessao,
  salvarSessao,
  limparSessao,
  listarBloqueios,
  diaBloqueado,
  bloquearDia,
  desbloquearDia,
};
