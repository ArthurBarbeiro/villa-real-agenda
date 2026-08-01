// ============================================================================
//  Agenda da Barbearia — frontend (PWA)
//  Conversa com a API do servidor (src/server.js).
// ============================================================================

const API = ''; // mesma origem
let CONFIG = null;
let ADMIN_PIN = null; // preenchido quando o barbeiro digita a senha

// ---------- Utilidades ----------
async function api(caminho, opcoes) {
  const headers = { 'Content-Type': 'application/json' };
  if (ADMIN_PIN) headers['x-admin-pin'] = ADMIN_PIN; // envia o PIN nas rotas protegidas
  const r = await fetch(API + caminho, {
    headers,
    ...opcoes,
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ erro: 'Erro' }));
    throw new Error(e.erro || 'Erro na requisição');
  }
  return r.json();
}

function setKids(parent){var nodes=[].slice.call(arguments,1);parent.innerHTML="";nodes.forEach(function(n){if(n)parent.appendChild(n);});}
function el(html) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstChild;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function reais(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatarDataBR(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function diaSemanaISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

// ---------- Abas ----------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const alvo = tab.dataset.tab;
    document.getElementById('view-cliente').classList.toggle('hidden', alvo !== 'cliente');
    document.getElementById('view-barbeiro').classList.toggle('hidden', alvo !== 'barbeiro');
    if (alvo === 'barbeiro') {
      if (ADMIN_PIN) carregarAgenda();   // já autenticado
      else mostrarTelaSenha();           // pede a senha primeiro
    }
  });
});

// ---------- Tela de senha (protege a aba Agenda) ----------
function mostrarTelaSenha() {
  document.getElementById('barbeiro-lock').classList.remove('hidden');
  document.getElementById('barbeiro-conteudo').classList.add('hidden');
  const inp = document.getElementById('pin-input');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
}

async function tentarEntrar() {
  const inp = document.getElementById('pin-input');
  const err = document.getElementById('pin-erro');
  const pin = (inp.value || '').trim();
  if (!pin) return;
  ADMIN_PIN = pin; // será usado no cabeçalho da requisição de verificação
  try {
    await api('/api/admin/verificar');
    // sucesso: libera a agenda
    err.classList.add('hidden');
    document.getElementById('barbeiro-lock').classList.add('hidden');
    document.getElementById('barbeiro-conteudo').classList.remove('hidden');
    carregarAgenda();
  } catch (e) {
    ADMIN_PIN = null; // senha errada
    err.classList.remove('hidden');
    inp.value = '';
    inp.focus();
  }
}

document.getElementById('pin-entrar').addEventListener('click', tentarEntrar);
document.getElementById('pin-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') tentarEntrar(); });

// ============================================================================
//  FLUXO DO CLIENTE (marcar horário)
// ============================================================================
const estadoCliente = { servico: null, data: null, hora: null, nome: '', telefone: '' };
const container = () => document.getElementById('fluxo-cliente');

function renderEscolhaServico() {
  estadoCliente.servico = estadoCliente.data = estadoCliente.hora = null;
  const card = el('<div class="card"><p class="step-title">Passo 1 de 4 — Serviço</p><div id="lista-servicos"></div></div>');
  const lista = card.querySelector('#lista-servicos');
  CONFIG.servicos.forEach((s) => {
    const extra = s.descricao ? `<br><small style="color:#8a7f72">${s.descricao}</small>` : '';
    const b = el(
      `<button class="option"><span><strong>${s.nome}</strong><br><small>${s.duracaoMin} min</small>${extra}</span><span class="price">${reais(s.preco)}</span></button>`
    );
    b.addEventListener('click', () => { estadoCliente.servico = s; renderEscolhaDia(); });
    lista.appendChild(b);
  });
  setKids(container(),card);
}

async function renderEscolhaDia() {
  const card = el('<div class="card"><p class="step-title">Passo 2 de 4 — Dia</p><div id="lista-dias"><div class="loader">Buscando dias com vaga…</div></div></div>');
  setKids(container(),botaoVoltar(renderEscolhaServico), card);
  try {
    const dias = await api(`/api/dias?servico=${estadoCliente.servico.id}`);
    const lista = card.querySelector('#lista-dias');
    if (!dias.length) { lista.innerHTML = '<p class="muted center">Sem vagas nos próximos dias. 😕</p>'; return; }
    setKids(lista,);
    dias.forEach((d) => {
      const b = el(`<button class="option"><span>${cap(d.label)}</span><span>›</span></button>`);
      b.addEventListener('click', () => { estadoCliente.data = d.data; renderEscolhaHora(); });
      lista.appendChild(b);
    });
  } catch (e) { card.querySelector('#lista-dias').innerHTML = `<p class="muted">${e.message}</p>`; }
}

async function renderEscolhaHora() {
  const card = el('<div class="card"><p class="step-title">Passo 3 de 4 — Horário</p><div id="lista-horas"><div class="loader">Buscando horários…</div></div></div>');
  setKids(container(),botaoVoltar(renderEscolhaDia), card);
  try {
    const horas = await api(`/api/horarios?servico=${estadoCliente.servico.id}&data=${estadoCliente.data}`);
    const lista = card.querySelector('#lista-horas');
    if (!horas.length) { lista.innerHTML = '<p class="muted center">Esse dia lotou. Escolha outro.</p>'; return; }
    const grid = el('<div class="grid-horarios"></div>');
    horas.forEach((h) => {
      const b = el(`<button class="option">${h}</button>`);
      b.addEventListener('click', () => { estadoCliente.hora = h; renderDados(); });
      grid.appendChild(b);
    });
    setKids(lista,grid);
  } catch (e) { card.querySelector('#lista-horas').innerHTML = `<p class="muted">${e.message}</p>`; }
}

function renderDados() {
  const s = estadoCliente.servico;
  const card = el(`
    <div class="card">
      <p class="step-title">Passo 4 de 4 — Seus dados</p>
      <div class="resumo">
        <div><span>Serviço</span><span>${s.nome}</span></div>
        <div><span>Dia</span><span>${formatarDataBR(estadoCliente.data)}</span></div>
        <div><span>Horário</span><span>${estadoCliente.hora}</span></div>
        <div><span>Valor</span><span>${reais(s.preco)}</span></div>
      </div>
      <label>Nome</label>
      <input type="text" id="in-nome" placeholder="Seu nome" value="${estadoCliente.nome}" />
      <label>WhatsApp / Telefone</label>
      <input type="tel" id="in-tel" placeholder="(11) 99999-9999" value="${estadoCliente.telefone}" />
      <button class="btn" id="btn-confirmar">Confirmar agendamento</button>
    </div>`);
  card.querySelector('#btn-confirmar').addEventListener('click', confirmar);
  setKids(container(),botaoVoltar(renderEscolhaHora), card);
}

async function confirmar() {
  const nome = document.getElementById('in-nome').value.trim();
  const tel = document.getElementById('in-tel').value.trim();
  if (nome.length < 2) return toast('Digite seu nome, por favor.');
  estadoCliente.nome = nome; estadoCliente.telefone = tel;
  const btn = document.getElementById('btn-confirmar');
  btn.disabled = true; btn.textContent = 'Confirmando…';
  try {
    await api('/api/agendamentos', {
      method: 'POST',
      body: JSON.stringify({
        servicoId: estadoCliente.servico.id,
        data: estadoCliente.data,
        hora: estadoCliente.hora,
        cliente: nome,
        telefone: tel || null,
        origem: 'agenda',
      }),
    });
    renderSucesso();
  } catch (e) {
    toast(e.message);
    btn.disabled = false; btn.textContent = 'Confirmar agendamento';
  }
}

function renderSucesso() {
  const s = estadoCliente.servico;
  const card = el(`
    <div class="card sucesso">
      <div class="check">✅</div>
      <h2>Agendado!</h2>
      <p class="muted">${s.nome} — ${formatarDataBR(estadoCliente.data)} às ${estadoCliente.hora}</p>
      <div class="resumo" style="margin-top:14px">
        <div><span>Local</span><span>${CONFIG.barbearia.endereco || ''}</span></div>
      </div>
      <button class="btn" id="btn-novo">Fazer outro agendamento</button>
    </div>`);
  card.querySelector('#btn-novo').addEventListener('click', () => { estadoCliente.nome = estadoCliente.nome; renderEscolhaServico(); });
  setKids(container(),card);
}

function botaoVoltar(fn) {
  const b = el('<button class="btn secondary" style="margin-bottom:12px">‹ Voltar</button>');
  b.addEventListener('click', fn);
  return b;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================================================
//  VISÃO DO BARBEIRO (agenda)
// ============================================================================
let diaAgenda = new Date();

function atualizarLabelDia() {
  const iso = isoLocal(diaAgenda);
  const hoje = isoLocal(new Date());
  const amanha = isoLocal(new Date(Date.now() + 86400000));
  let label = NOMES_DIAS[diaAgenda.getDay()];
  if (iso === hoje) label = 'Hoje';
  else if (iso === amanha) label = 'Amanhã';
  document.getElementById('dia-label').textContent = label;
  document.getElementById('dia-data').textContent = formatarDataBR(iso);
}

async function carregarAgenda() {
  atualizarLabelDia();
  const iso = isoLocal(diaAgenda);
  const box = document.getElementById('lista-agenda');
  box.innerHTML = '<div class="loader">Carregando…</div>';
  try {
    const lista = await api(`/api/agendamentos?data=${iso}`);
    if (!lista.length) { box.innerHTML = '<p class="muted center" style="padding:20px 0">Nenhum horário marcado neste dia.</p>'; return; }
    lista.sort((a, b) => a.hora.localeCompare(b.hora));
    setKids(box,);
    lista.forEach((a) => {
      const item = el(`
        <div class="ag-item">
          <div class="ag-hora">${a.hora}</div>
          <div class="ag-info">
            <strong>${a.cliente}</strong>
            <small>${a.servicoNome}${a.telefone ? ' · ' + a.telefone : ''}</small>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="badge ${a.origem === 'whatsapp' ? 'wpp' : ''}">${a.origem === 'whatsapp' ? 'WhatsApp' : 'Balcão'}</span>
            <button class="btn danger">Cancelar</button>
          </div>
        </div>`);
      item.querySelector('.btn.danger').addEventListener('click', () => cancelarAgendamento(a.id, a.cliente));
      box.appendChild(item);
    });
  } catch (e) { box.innerHTML = `<p class="muted">${e.message}</p>`; }
}

async function cancelarAgendamento(id, cliente) {
  if (!confirm(`Cancelar o horário de ${cliente}?`)) return;
  try {
    await api(`/api/agendamentos/${id}/cancelar`, { method: 'POST' });
    toast('Agendamento cancelado.');
    carregarAgenda();
  } catch (e) { toast(e.message); }
}

document.getElementById('dia-anterior').addEventListener('click', () => { diaAgenda.setDate(diaAgenda.getDate() - 1); carregarAgenda(); });
document.getElementById('dia-proximo').addEventListener('click', () => { diaAgenda.setDate(diaAgenda.getDate() + 1); carregarAgenda(); });

// Encaixe manual (barbeiro marca um cliente que chegou no balcão)
document.getElementById('btn-encaixar').addEventListener('click', () => {
  const card = el(`
    <div class="card">
      <p class="step-title">Encaixar cliente</p>
      <label>Nome do cliente</label>
      <input type="text" id="enc-nome" placeholder="Nome" />
      <label>Serviço</label>
      <select id="enc-servico" style="width:100%;padding:13px;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;color:var(--text);font-size:16px"></select>
      <label>Data</label>
      <input type="date" id="enc-data" value="${isoLocal(diaAgenda)}" />
      <label>Horário</label>
      <select id="enc-hora" style="width:100%;padding:13px;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;color:var(--text);font-size:16px"></select>
      <button class="btn" id="enc-salvar">Salvar encaixe</button>
      <button class="btn secondary" id="enc-cancelar">Cancelar</button>
    </div>`);
  const selServ = card.querySelector('#enc-servico');
  CONFIG.servicos.forEach((s) => selServ.appendChild(el(`<option value="${s.id}">${s.nome}</option>`)));
  const inData = card.querySelector('#enc-data');
  const selHora = card.querySelector('#enc-hora');
  async function atualizarHoras() {
    selHora.innerHTML = '<option>Carregando…</option>';
    try {
      const horas = await api(`/api/horarios?servico=${selServ.value}&data=${inData.value}`);
      selHora.innerHTML = horas.length ? horas.map((h) => `<option>${h}</option>`).join('') : '<option value="">Sem horários</option>';
    } catch { selHora.innerHTML = '<option value="">Erro</option>'; }
  }
  selServ.addEventListener('change', atualizarHoras);
  inData.addEventListener('change', atualizarHoras);
  atualizarHoras();
  card.querySelector('#enc-cancelar').addEventListener('click', () => card.remove());
  card.querySelector('#enc-salvar').addEventListener('click', async () => {
    const nome = card.querySelector('#enc-nome').value.trim();
    if (nome.length < 2) return toast('Informe o nome.');
    if (!selHora.value) return toast('Escolha um horário.');
    try {
      await api('/api/agendamentos', {
        method: 'POST',
        body: JSON.stringify({ servicoId: selServ.value, data: inData.value, hora: selHora.value, cliente: nome, origem: 'agenda' }),
      });
      toast('Encaixe salvo!');
      card.remove();
      diaAgenda = new Date(inData.value + 'T12:00:00');
      carregarAgenda();
    } catch (e) { toast(e.message); }
  });
  document.getElementById('view-barbeiro').appendChild(card);
});

// ============================================================================
//  Inicialização
// ============================================================================
(async function init() {
  try {
    CONFIG = await api('/api/config');
    const elNome = document.getElementById('nome-barbearia');
    if (elNome) elNome.textContent = CONFIG.barbearia.nome;
    document.getElementById('endereco-barbearia').textContent = CONFIG.barbearia.endereco || '';
    document.title = 'Agenda — ' + CONFIG.barbearia.nome;
    renderEscolhaServico();
  } catch (e) {
    container().innerHTML = `<div class="card"><p class="muted">Não consegui conectar ao servidor. Verifique se ele está rodando.<br><br>${e.message}</p></div>`;
  }
})();

// Service worker (funciona offline / instalável)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
