// Testes automatizados da lógica principal (sem WhatsApp, sem navegador).
// Rode com: npm test
const assert = require('assert');
const slots = require('../src/slots');
const { handleMessage } = require('../src/conversation');

let passou = 0;
function teste(nome, fn) {
  try { fn(); console.log('  ✓ ' + nome); passou++; }
  catch (e) { console.error('  ✗ ' + nome + '\n    ' + e.message); process.exitCode = 1; }
}

// Config de teste isolada (não usa config.js real)
const cfg = {
  horarios: {
    1: [{ inicio: '09:00', fim: '12:00' }, { inicio: '13:00', fim: '18:00' }], // segunda
    6: [{ inicio: '09:00', fim: '11:00' }], // sábado curto
  },
  regras: { intervaloSlotMin: 30, diasParaFrente: 14, antecedenciaMinutosMin: 60, maxAgendamentosPorCliente: 3 },
};

// Uma segunda-feira futura conhecida: 2026-08-03 é segunda-feira
const SEGUNDA = '2026-08-03';
const SABADO = '2026-08-01';
const DOMINGO = '2026-08-02';
// "agora" bem antes, para não esbarrar em antecedência
const AGORA = new Date('2026-07-20T10:00:00');

console.log('\n== slots ==');

teste('dia fechado (domingo) não tem horários', () => {
  assert.deepStrictEqual(slots.horariosDisponiveis(DOMINGO, 30, [], cfg, AGORA), []);
});

teste('segunda gera horários da manhã e tarde', () => {
  const h = slots.horariosDisponiveis(SEGUNDA, 30, [], cfg, AGORA);
  assert.ok(h.includes('09:00'), 'deve ter 09:00');
  assert.ok(h.includes('11:30'), 'deve ter 11:30 (cabe corte de 30min até 12:00)');
  assert.ok(!h.includes('12:00'), 'não deve ter 12:00 (almoço)');
  assert.ok(h.includes('13:00'), 'deve ter 13:00');
  assert.ok(h.includes('17:30'), 'deve ter 17:30 (último de 30min até 18:00)');
});

teste('serviço longo não cabe perto do fechamento', () => {
  // Corte+barba de 50min: às 11:30 iria até 12:20 > 12:00 -> não deve aparecer
  const h = slots.horariosDisponiveis(SEGUNDA, 50, [], cfg, AGORA);
  assert.ok(!h.includes('11:30'), '11:30 não cabe para 50min antes do almoço');
  assert.ok(h.includes('11:00'), '11:00 cabe (11:00-11:50)');
});

teste('agendamento existente bloqueia horário sobreposto', () => {
  const existentes = [{ status: 'confirmado', data: SEGUNDA, hora: '10:00', duracaoMin: 30 }];
  const h = slots.horariosDisponiveis(SEGUNDA, 30, existentes, cfg, AGORA);
  assert.ok(!h.includes('10:00'), '10:00 ocupado');
  assert.ok(h.includes('09:30'), '09:30 livre');
  assert.ok(h.includes('10:30'), '10:30 livre');
});

teste('antecedência mínima corta horários de hoje', () => {
  // "agora" = segunda 09:15; antecedência 60min => só a partir de 10:15 -> 10:30
  const agoraHoje = new Date('2026-08-03T09:15:00');
  const h = slots.horariosDisponiveis(SEGUNDA, 30, [], cfg, agoraHoje);
  assert.ok(!h.includes('09:30'), '09:30 é cedo demais');
  assert.ok(!h.includes('10:00'), '10:00 ainda dentro da antecedência');
  assert.ok(h.includes('10:30'), '10:30 ok');
});

teste('próximos dias com vaga pula domingo', () => {
  const dias = slots.proximosDiasComVaga(30, [], cfg, AGORA);
  const datas = dias.map((d) => d.data);
  assert.ok(!datas.includes(DOMINGO), 'domingo fechado não aparece');
  assert.ok(datas.includes(SEGUNDA), 'segunda aparece');
});

console.log('\n== conversa do bot ==');

// API falsa para testar o fluxo de conversa de ponta a ponta
function criarApiFake() {
  const servicos = [
    { id: 'corte', nome: 'Corte de cabelo', duracaoMin: 30, preco: 40 },
    { id: 'barba', nome: 'Barba', duracaoMin: 20, preco: 30 },
  ];
  const marcados = [];
  const clientes = {};
  return {
    _marcados: marcados,
    _clientes: clientes,
    listarServicos: () => servicos,
    servicoPorId: (id) => servicos.find((s) => s.id === id),
    diasDisponiveis: () => [{ data: SEGUNDA, dow: 1, label: 'segunda-feira, 03/08' }, { data: '2026-08-04', dow: 2, label: 'terça-feira, 04/08' }],
    horariosDisponiveis: () => ['09:00', '09:30', '10:00'],
    agendar: (dados) => { const a = { id: String(marcados.length + 1), ...dados, servicoNome: 'Corte de cabelo' }; marcados.push(a); if (dados.telefone) clientes[dados.telefone] = { nome: dados.cliente, telefone: dados.telefone }; return { ok: true, agendamento: a }; },
    agendamentosDoCliente: (tel) => marcados.filter((a) => a.telefone === tel),
    cancelar: (id) => { const a = marcados.find((x) => x.id === id); if (a) { a.status = 'cancelado'; return { ok: true, agendamento: a }; } return { ok: false, erro: 'não achou' }; },
    obterCliente: (tel) => clientes[tel] || null,
  };
}

teste('fluxo completo: cliente novo marca um horário', () => {
  const api = criarApiFake();
  const tel = '5511900000001@c.us';
  let s = null, r;

  r = handleMessage(s, 'oi', tel, api, AGORA); s = r.session;
  assert.ok(/assistente/i.test(r.reply), 'saúda com menu');
  assert.strictEqual(s.estado, 'menu');

  r = handleMessage(s, '1', tel, api, AGORA); s = r.session;
  assert.strictEqual(s.estado, 'servico');
  assert.ok(/Corte de cabelo/.test(r.reply));

  r = handleMessage(s, '1', tel, api, AGORA); s = r.session;
  assert.strictEqual(s.estado, 'data');

  r = handleMessage(s, '1', tel, api, AGORA); s = r.session;
  assert.strictEqual(s.estado, 'hora');
  assert.ok(/09:00/.test(r.reply));

  r = handleMessage(s, '1', tel, api, AGORA); s = r.session;
  assert.strictEqual(s.estado, 'nome', 'cliente novo -> pede nome');

  r = handleMessage(s, 'João Silva', tel, api, AGORA); s = r.session;
  assert.strictEqual(s, null, 'conversa encerra após confirmar');
  assert.ok(/confirmado/i.test(r.reply), 'mensagem de confirmação');
  assert.strictEqual(api._marcados.length, 1, 'um agendamento criado');
  assert.strictEqual(api._marcados[0].cliente, 'João Silva');
  assert.strictEqual(api._marcados[0].hora, '09:00');
});

teste('cliente conhecido não precisa digitar nome de novo', () => {
  const api = criarApiFake();
  const tel = '5511900000002@c.us';
  api._clientes[tel] = { nome: 'Maria', telefone: tel };
  let s = null, r;
  r = handleMessage(s, 'oi', tel, api, AGORA); s = r.session;
  r = handleMessage(s, '1', tel, api, AGORA); s = r.session; // servico
  r = handleMessage(s, '1', tel, api, AGORA); s = r.session; // dia
  r = handleMessage(s, '1', tel, api, AGORA); s = r.session; // hora
  r = handleMessage(s, '1', tel, api, AGORA); s = r.session; // escolhe horário -> confirma direto
  assert.strictEqual(s, null);
  assert.ok(/confirmado/i.test(r.reply));
  assert.strictEqual(api._marcados[0].cliente, 'Maria');
});

teste('opção inválida no menu não quebra', () => {
  const api = criarApiFake();
  const tel = '5511900000003@c.us';
  let r = handleMessage(null, 'oi', tel, api, AGORA);
  r = handleMessage(r.session, '99', tel, api, AGORA);
  assert.ok(/não entendi/i.test(r.reply), 'responde educadamente');
  assert.strictEqual(r.session.estado, 'menu');
});

teste('digitar "menu" a qualquer momento reinicia', () => {
  const api = criarApiFake();
  const tel = '5511900000004@c.us';
  let r = handleMessage(null, 'oi', tel, api, AGORA);
  r = handleMessage(r.session, '1', tel, api, AGORA); // entrou em servico
  r = handleMessage(r.session, 'menu', tel, api, AGORA);
  assert.strictEqual(r.session.estado, 'menu');
});

teste('ver agendamentos lista o que o cliente marcou', () => {
  const api = criarApiFake();
  const tel = '5511900000005@c.us';
  api._marcados.push({ id: '1', telefone: tel, servicoNome: 'Corte de cabelo', data: SEGUNDA, hora: '09:00', status: 'confirmado' });
  let r = handleMessage(null, 'oi', tel, api, AGORA);
  r = handleMessage(r.session, '2', tel, api, AGORA);
  assert.ok(/Corte de cabelo/.test(r.reply), 'mostra o agendamento');
});

console.log(`\n${passou} testes passaram.\n`);
