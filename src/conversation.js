// ============================================================================
//  MÁQUINA DE ESTADOS DA CONVERSA (pura, testável sem WhatsApp)
//  Recebe a mensagem do cliente + o estado atual da conversa e devolve:
//    - a resposta que o bot deve enviar
//    - o novo estado da conversa (ou null quando a conversa termina/reinicia)
//
//  Não fala com o WhatsApp nem com o banco diretamente: recebe um "api" com as
//  funções de agendamento injetadas. Isso deixa a lógica 100% testável.
// ============================================================================

const config = require('../config');

function reais(v) {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

// Extrai o primeiro número inteiro de um texto ("opção 2" -> 2, "2" -> 2)
function pegarNumero(texto) {
  const m = String(texto).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function normalizar(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos
}

const PALAVRAS_MENU = ['menu', 'inicio', 'oi', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'comecar', 'voltar'];
const PALAVRAS_CANCELAR_FLUXO = ['sair', 'parar', 'cancelar conversa'];

function textoMenu() {
  const nome = config.barbearia.nome;
  const saud = (config.mensagens.saudacao || 'Olá! Sou o assistente da *{barbearia}*. O que deseja?')
    .replace(/{barbearia}/g, nome)
    .replace(/{barbeiro}/g, config.barbearia.barbeiro);
  return (
    `${saud}\n\n` +
    `1️⃣ Marcar um horário\n` +
    `2️⃣ Ver meus agendamentos\n` +
    `3️⃣ Cancelar um agendamento\n` +
    `4️⃣ Falar com ${config.barbearia.barbeiro}\n\n` +
    `_Responda com o número da opção._`
  );
}

function listaServicos(api) {
  const servicos = api.listarServicos();
  const linhas = servicos.map(
    (s, i) => `${i + 1}) ${s.nome} — ${reais(s.preco)} (${s.duracaoMin} min)`
  );
  return { texto: `✂️ *Escolha o serviço:*\n\n${linhas.join('\n')}\n\n_Responda com o número._`, servicos };
}

// -------- Função principal --------
// session: objeto { estado, dados } ou null
// texto: mensagem recebida
// telefone: identificador do cliente (número do WhatsApp)
// api: funções de agendamento injetadas
// agora: Date de referência
// Retorna { reply, session }  (session null = conversa encerrada)
function handleMessage(session, texto, telefone, api, agora = new Date()) {
  const norm = normalizar(texto);

  // Comandos globais: voltar ao menu ou sair a qualquer momento
  if (PALAVRAS_CANCELAR_FLUXO.includes(norm)) {
    return { reply: 'Tudo bem, encerrei por aqui. Quando quiser é só mandar *oi*. 👋', session: null };
  }
  if (!session || PALAVRAS_MENU.includes(norm)) {
    return { reply: textoMenu(), session: { estado: 'menu', dados: {} } };
  }

  const estado = session.estado;
  const dados = session.dados || {};

  // ---------------- MENU PRINCIPAL ----------------
  if (estado === 'menu') {
    const op = pegarNumero(norm);
    if (op === 1) {
      const { texto: t, servicos } = listaServicos(api);
      return { reply: t, session: { estado: 'servico', dados: { opcoesServicos: servicos.map((s) => s.id) } } };
    }
    if (op === 2) {
      return { reply: textoAgendamentos(telefone, api, agora) + '\n\nDigite *menu* para voltar.', session };
    }
    if (op === 3) {
      return iniciarCancelamento(telefone, api, agora);
    }
    if (op === 4) {
      const tel = config.barbearia.telefoneContato;
      return {
        reply:
          `Claro! Você pode falar direto com ${config.barbearia.barbeiro}:\n` +
          `📞 https://wa.me/${tel}\n\nDigite *menu* para voltar ao início.`,
        session,
      };
    }
    return { reply: 'Não entendi. 🙈\n\n' + textoMenu(), session: { estado: 'menu', dados: {} } };
  }

  // ---------------- ESCOLHA DO SERVIÇO ----------------
  if (estado === 'servico') {
    const op = pegarNumero(norm);
    const ids = dados.opcoesServicos || [];
    if (!op || op < 1 || op > ids.length) {
      const { texto: t } = listaServicos(api);
      return { reply: 'Escolha um número válido, por favor.\n\n' + t, session };
    }
    const servicoId = ids[op - 1];
    const servico = api.servicoPorId(servicoId);
    const dias = api.diasDisponiveis(servicoId, agora);
    if (dias.length === 0) {
      return {
        reply: `Poxa, não há vagas para *${servico.nome}* nos próximos dias. 😕\nDigite *menu* para tentar outro serviço.`,
        session: { estado: 'menu', dados: {} },
      };
    }
    const linhas = dias.map((d, i) => `${i + 1}) ${d.label}`);
    return {
      reply: `📅 *${servico.nome}* — escolha o dia:\n\n${linhas.join('\n')}\n\n_Responda com o número._`,
      session: { estado: 'data', dados: { servicoId, servicoNome: servico.nome, opcoesDias: dias.map((d) => d.data) } },
    };
  }

  // ---------------- ESCOLHA DO DIA ----------------
  if (estado === 'data') {
    const op = pegarNumero(norm);
    const datas = dados.opcoesDias || [];
    if (!op || op < 1 || op > datas.length) {
      return { reply: 'Escolha um número de dia válido, por favor. Ou digite *menu* para recomeçar.', session };
    }
    const data = datas[op - 1];
    const horarios = api.horariosDisponiveis(dados.servicoId, data, agora);
    if (horarios.length === 0) {
      return { reply: 'Esse dia acabou de lotar. Digite *menu* e tente outro dia.', session: { estado: 'menu', dados: {} } };
    }
    const linhas = horarios.map((h, i) => `${i + 1}) ${h}`);
    return {
      reply: `🕐 Horários livres:\n\n${linhas.join('\n')}\n\n_Responda com o número._`,
      session: { estado: 'hora', dados: { ...dados, data, opcoesHoras: horarios } },
    };
  }

  // ---------------- ESCOLHA DO HORÁRIO ----------------
  if (estado === 'hora') {
    const op = pegarNumero(norm);
    const horas = dados.opcoesHoras || [];
    if (!op || op < 1 || op > horas.length) {
      return { reply: 'Escolha um número de horário válido, por favor.', session };
    }
    const hora = horas[op - 1];
    const cliente = api.obterCliente(telefone);
    if (cliente && cliente.nome) {
      // Já conhecemos o cliente: confirma direto
      return finalizarAgendamento({ ...dados, hora }, cliente.nome, telefone, api, agora);
    }
    // Não conhecemos: pedir o nome
    return {
      reply: 'Quase lá! Como é o seu *nome*? (para eu registrar o agendamento)',
      session: { estado: 'nome', dados: { ...dados, hora } },
    };
  }

  // ---------------- NOME DO CLIENTE ----------------
  if (estado === 'nome') {
    const nome = String(texto).trim();
    if (nome.length < 2) {
      return { reply: 'Pode me dizer seu nome, por favor?', session };
    }
    return finalizarAgendamento(dados, nome, telefone, api, agora);
  }

  // ---------------- CANCELAMENTO ----------------
  if (estado === 'cancelar') {
    const op = pegarNumero(norm);
    const ids = dados.opcoesCancelar || [];
    if (!op || op < 1 || op > ids.length) {
      return { reply: 'Escolha um número válido do agendamento que deseja cancelar, ou digite *menu*.', session };
    }
    const id = ids[op - 1];
    const r = api.cancelar(id);
    if (!r.ok) {
      return { reply: 'Não consegui cancelar. Digite *menu* e tente de novo.', session: { estado: 'menu', dados: {} } };
    }
    const a = r.agendamento;
    return {
      reply: `✅ Cancelado! ${a.servicoNome} de ${formatarData(a.data)} às ${a.hora} foi cancelado.\n\nDigite *menu* se precisar de mais alguma coisa.`,
      session: null,
    };
  }

  // Estado desconhecido -> reinicia
  return { reply: textoMenu(), session: { estado: 'menu', dados: {} } };
}

// -------- Auxiliares --------

function finalizarAgendamento(dados, nome, telefone, api, agora) {
  const r = api.agendar(
    {
      servicoId: dados.servicoId,
      data: dados.data,
      hora: dados.hora,
      cliente: nome,
      telefone,
      origem: 'whatsapp',
    },
    agora
  );
  if (!r.ok) {
    return { reply: `❌ ${r.erro}\n\nDigite *menu* para recomeçar.`, session: { estado: 'menu', dados: {} } };
  }
  const a = r.agendamento;
  return {
    reply:
      `✅ *Agendamento confirmado!*\n\n` +
      `👤 ${a.cliente}\n` +
      `✂️ ${a.servicoNome}\n` +
      `📅 ${formatarData(a.data)}\n` +
      `🕐 ${a.hora}\n` +
      `📍 ${config.barbearia.endereco}\n\n` +
      `Até lá! Se precisar cancelar, é só mandar *oi* e escolher a opção 3.`,
    session: null,
  };
}

function textoAgendamentos(telefone, api, agora) {
  const lista = api.agendamentosDoCliente(telefone, agora);
  if (lista.length === 0) return 'Você não tem nenhum horário marcado no momento. 📭';
  const linhas = lista.map((a) => `• ${a.servicoNome} — ${formatarData(a.data)} às ${a.hora}`);
  return `📋 *Seus agendamentos:*\n\n${linhas.join('\n')}`;
}

function iniciarCancelamento(telefone, api, agora) {
  const lista = api.agendamentosDoCliente(telefone, agora);
  if (lista.length === 0) {
    return {
      reply: 'Você não tem nenhum horário marcado para cancelar. 📭\n\nDigite *menu* para voltar.',
      session: { estado: 'menu', dados: {} },
    };
  }
  const linhas = lista.map((a, i) => `${i + 1}) ${a.servicoNome} — ${formatarData(a.data)} às ${a.hora}`);
  return {
    reply: `Qual agendamento deseja cancelar?\n\n${linhas.join('\n')}\n\n_Responda com o número._`,
    session: { estado: 'cancelar', dados: { opcoesCancelar: lista.map((a) => a.id) } },
  };
}

function formatarData(dataStr) {
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

module.exports = { handleMessage, textoMenu, normalizar, pegarNumero };
