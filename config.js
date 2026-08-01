// ============================================================================
//  CONFIGURAÇÃO DA BARBEARIA
//  Edite este arquivo para personalizar tudo: nome, serviços, horários.
//  Não precisa mexer em mais nada do código para o dia a dia.
// ============================================================================

module.exports = {
  // ---- Dados do estabelecimento ----
  barbearia: {
    nome: 'Villa Real',   // aparece nas mensagens e no topo da agenda
    barbeiro: 'Arthur',   // nome de quem corta (usado nas mensagens)
    endereco: 'Av. Yervant Kissajikian, 1633 - Cidade Ademar, São Paulo - SP, 04428-010',
    // Telefone do dono para o cliente falar direto (formato internacional, só números)
    telefoneContato: '5511977649681',
  },

  // ---- Serviços oferecidos ----
  // duracaoMin = quanto tempo o serviço ocupa na agenda (em minutos)
  // preco = em reais (só exibição)
  servicos: [
    { id: 'corte_social',  nome: 'Corte social',            duracaoMin: 30, preco: 35 },
    { id: 'corte_tesoura', nome: 'Corte social na tesoura', duracaoMin: 40, preco: 45 },
    { id: 'corte_degrade', nome: 'Corte degradê',           duracaoMin: 40, preco: 45,
      descricao: 'Low, Mid, High, Buzz, Mullet, Moicano, Americano, Tap, Sufista' },
    { id: 'barba',         nome: 'Barba simples',           duracaoMin: 20, preco: 30 },
    { id: 'barboterapia',  nome: 'Barboterapia',            duracaoMin: 40, preco: 70 },
    { id: 'sobrancelha',   nome: 'Sobrancelha',             duracaoMin: 10, preco: 10 },
    { id: 'bigode',        nome: 'Bigode',                  duracaoMin: 10, preco: 10 },
    { id: 'depil_nasal',   nome: 'Depilação nasal',         duracaoMin: 10, preco: 10 },
    { id: 'depil_ouvido',  nome: 'Depilação de ouvido',     duracaoMin: 10, preco: 10 },
    { id: 'alisamento',    nome: 'Alisamento',              duracaoMin: 40, preco: 35 },
    { id: 'progressiva',   nome: 'Progressiva',             duracaoMin: 90, preco: 70 },
    { id: 'botox',         nome: 'Botox capilar',           duracaoMin: 60, preco: 70 },
  ],

  // ---- Horário de funcionamento ----
  // Chave = dia da semana (0 = domingo, 1 = segunda, ... 6 = sábado)
  // Cada dia pode ter um ou mais blocos (ex.: manhã e tarde, com pausa pro almoço)
  // Se um dia não estiver aqui, está FECHADO.
  horarios: {
    0: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '14:00' }], // domingo
    1: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '19:00' }], // segunda
    2: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '19:00' }], // terça
    3: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '19:00' }], // quarta
    4: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '19:00' }], // quinta
    5: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '20:00' }], // sexta
    6: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '20:00' }], // sábado
  },

  // ---- Regras de agendamento ----
  regras: {
    intervaloSlotMin: 30,      // de quantos em quantos minutos os horários aparecem
    diasParaFrente: 14,        // quantos dias à frente o cliente pode marcar
    antecedenciaMinutosMin: 60,// não deixa marcar com menos de X minutos de antecedência
    maxAgendamentosPorCliente: 3, // limite de horários futuros por cliente (anti-abuso)
  },

  // ---- Servidor ----
  porta: 3000,

  // ---- Senha (PIN) da aba Agenda do barbeiro ----
  // Só quem tem este PIN consegue ver a lista de agendamentos e cancelar.
  // O cliente vê apenas a aba "Agendar". Pode ser definido pela variável de
  // ambiente ADMIN_PIN na hospedagem (recomendado) ou trocado aqui direto.
  adminPin: process.env.ADMIN_PIN || '2580',

  // ---- Mensagens do bot (personalize o tom aqui) ----
  mensagens: {
    // {barbearia} e {barbeiro} são substituídos automaticamente
    saudacao:
      'Olá! 👋 Sou o assistente virtual da *{barbearia}*.\n' +
      'Posso te ajudar a marcar seu horário. O que deseja?',
  },
};
