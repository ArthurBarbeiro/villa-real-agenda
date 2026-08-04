// ============================================================================
//  SERVIDOR WEB (API + agenda PWA)
//  Serve a agenda instalável no celular e expõe a API que tanto a agenda
//  quanto o bot de WhatsApp usam. Roda junto com o bot no mesmo processo.
// ============================================================================

// Fuso horário de Brasília (garante que "hoje" e os horários batam com o Brasil,
// mesmo com o servidor hospedado em outro país).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const path = require('path');
const express = require('express');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
const botState = require('./botState');
const { dataLocalISO } = require('./slots');

// Gerador de QR em imagem (opcional — se não estiver instalado, devolvemos o texto)
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { /* opcional */ }

function criarApp() {
  const app = express();
  app.use(express.json());

  // ---- API ----

  // Middleware de segurança: exige o PIN do barbeiro no cabeçalho "x-admin-pin".
  // Protege as rotas que listam e cancelam agendamentos (visão do barbeiro).
  function exigirPin(req, res, next) {
    const pin = req.get('x-admin-pin') || req.query.pin;
    if (pin && String(pin) === String(config.adminPin)) return next();
    return res.status(401).json({ erro: 'PIN incorreto ou não informado.' });
  }

  // Endpoint para o app validar o PIN digitado na aba Agenda
  app.get('/api/admin/verificar', exigirPin, (req, res) => res.json({ ok: true }));

  // Status da conexão do WhatsApp + QR Code (protegido por PIN).
  // Retorna o QR já como imagem (data URL) para o app só exibir.
  app.get('/api/admin/whatsapp', exigirPin, async (req, res) => {
    const estado = botState.obter();
    let qrImagem = null;
    if (estado.status === 'qr' && estado.qr && QRCode) {
      try {
        qrImagem = await QRCode.toDataURL(estado.qr, { margin: 1, width: 320 });
      } catch (e) { /* ignora */ }
    }
    res.json({
      status: estado.status,     // desligado | iniciando | qr | conectado | desconectado
      numero: estado.numero || null,
      qrImagem,                  // data:image/png;base64,... (quando status = qr)
      qrTexto: estado.status === 'qr' ? estado.qr : null,
      botAtivo: process.env.SEM_BOT !== '1',
    });
  });

  // Informações públicas para o frontend montar a tela
  app.get('/api/config', (req, res) => {
    res.json({
      barbearia: config.barbearia,
      servicos: config.servicos,
      regras: config.regras,
    });
  });

  app.get('/api/servicos', (req, res) => {
    res.json(booking.listarServicos());
  });

  // Dias com vaga para um serviço
  app.get('/api/dias', (req, res) => {
    const { servico } = req.query;
    if (!servico) return res.status(400).json({ erro: 'Informe ?servico=' });
    res.json(booking.diasDisponiveis(servico));
  });

  // Horários livres de um serviço num dia
  app.get('/api/horarios', (req, res) => {
    const { servico, data } = req.query;
    if (!servico || !data) return res.status(400).json({ erro: 'Informe ?servico= e ?data=' });
    res.json(booking.horariosDisponiveis(servico, data));
  });

  // ---- Bloqueio de dias (folga / imprevisto) — PROTEGIDO por PIN ----

  // Lista os dias bloqueados (só os de hoje em diante), com contagem de
  // agendamentos que já existiam em cada dia (para o barbeiro decidir).
  app.get('/api/admin/bloqueios', exigirPin, (req, res) => {
    const hoje = dataLocalISO();
    const lista = db.listarBloqueios()
      .filter((b) => b.data >= hoje)
      .map((b) => ({
        ...b,
        agendamentos: db.listarAgendamentos({ status: 'confirmado', data: b.data }).length,
      }));
    res.json(lista);
  });

  // Bloqueia um dia inteiro. Body: { data: 'YYYY-MM-DD', motivo? }
  app.post('/api/admin/bloqueios', exigirPin, (req, res) => {
    const { data, motivo } = req.body || {};
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ erro: 'Informe a data no formato YYYY-MM-DD.' });
    }
    const bloqueio = db.bloquearDia(data, motivo);
    const agendamentos = db.listarAgendamentos({ status: 'confirmado', data }).length;
    res.status(201).json({ ...bloqueio, agendamentos });
  });

  // Desbloqueia um dia. Ex.: DELETE /api/admin/bloqueios/2026-08-10
  app.delete('/api/admin/bloqueios/:data', exigirPin, (req, res) => {
    const ok = db.desbloquearDia(req.params.data);
    if (!ok) return res.status(404).json({ erro: 'Esse dia não estava bloqueado.' });
    res.json({ ok: true });
  });

  // Diz se um dia específico está bloqueado (usado pela agenda do barbeiro)
  app.get('/api/admin/bloqueios/:data', exigirPin, (req, res) => {
    res.json({ data: req.params.data, bloqueado: db.diaBloqueado(req.params.data) });
  });

  // Lista de agendamentos (visão do barbeiro) — PROTEGIDO por PIN.
  app.get('/api/agendamentos', exigirPin, (req, res) => {
    const { data, de } = req.query;
    let lista = db.listarAgendamentos({ status: 'confirmado' });
    if (data) {
      lista = lista.filter((a) => a.data === data);
    } else {
      const inicio = de || dataLocalISO();
      lista = lista.filter((a) => a.data >= inicio);
    }
    res.json(lista);
  });

  // Cria um agendamento (usado pela agenda do barbeiro para encaixar clientes)
  app.post('/api/agendamentos', (req, res) => {
    const { servicoId, data, hora, cliente, telefone, origem } = req.body || {};
    const r = booking.agendar({ servicoId, data, hora, cliente, telefone, origem: origem || 'agenda' });
    if (!r.ok) return res.status(400).json({ erro: r.erro });
    res.status(201).json(r.agendamento);
  });

  // Cancela um agendamento — PROTEGIDO por PIN.
  app.post('/api/agendamentos/:id/cancelar', exigirPin, (req, res) => {
    const r = booking.cancelar(req.params.id);
    if (!r.ok) return res.status(404).json({ erro: r.erro });
    res.json(r.agendamento);
  });

  // ---- Arquivos estáticos da agenda (PWA) ----
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

function iniciarServidor() {
  const app = criarApp();
  const porta = process.env.PORT || config.porta || 3000;
  return app.listen(porta, () => {
    console.log(`\n🌐 Agenda no ar: http://localhost:${porta}`);
    console.log(`   (abra esse endereço no navegador do celular para instalar o app)\n`);
  });
}

// Se rodar direto (node src/server.js), sobe só o servidor
if (require.main === module) {
  iniciarServidor();
}

module.exports = { criarApp, iniciarServidor };
// ============================================================================
//  SERVIDOR WEB (API + agenda PWA)
//  Serve a agenda instalável no celular e expõe a API que tanto a agenda
//  quanto o bot de WhatsApp usam. Roda junto com o bot no mesmo processo.
// ============================================================================

// Fuso horário de Brasília (garante que "hoje" e os horários batam com o Brasil,
// mesmo com o servidor hospedado em outro país).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const path = require('path');
const express = require('express');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
const botState = require('./botState');
const { dataLocalISO } = require('./slots');

// Gerador de QR em imagem (opcional — se não estiver instalado, devolvemos o texto)
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { /* opcional */ }

function criarApp() {
  const app = express();
  app.use(express.json());

  // ---- API ----

  // Middleware de segurança: exige o PIN do barbeiro no cabeçalho "x-admin-pin".
  // Protege as rotas que listam e cancelam agendamentos (visão do barbeiro).
  function exigirPin(req, res, next) {
    const pin = req.get('x-admin-pin') || req.query.pin;
    if (pin && String(pin) === String(config.adminPin)) return next();
    return res.status(401).json({ erro: 'PIN incorreto ou não informado.' });
  }

  // Endpoint para o app validar o PIN digitado na aba Agenda
  app.get('/api/admin/verificar', exigirPin, (req, res) => res.json({ ok: true }));

  // Status da conexão do WhatsApp + QR Code (protegido por PIN).
  // Retorna o QR já como imagem (data URL) para o app só exibir.
  app.get('/api/admin/whatsapp', exigirPin, async (req, res) => {
    const estado = botState.obter();
    let qrImagem = null;
    if (estado.status === 'qr' && estado.qr && QRCode) {
      try {
        qrImagem = await QRCode.toDataURL(estado.qr, { margin: 1, width: 320 });
      } catch (e) { /* ignora */ }
    }
    res.json({
      status: estado.status,     // desligado | iniciando | qr | conectado | desconectado
      numero: estado.numero || null,
      qrImagem,                  // data:image/png;base64,... (quando status = qr)
      qrTexto: estado.status === 'qr' ? estado.qr : null,
      botAtivo: process.env.SEM_BOT !== '1',
    });
  });

  // Informações públicas para o frontend montar a tela
  app.get('/api/config', (req, res) => {
    res.json({
      barbearia: config.barbearia,
      servicos: config.servicos,
      regras: config.regras,
    });
  });

  app.get('/api/servicos', (req, res) => {
    res.json(booking.listarServicos());
  });

  // Dias com vaga para um serviço
  app.get('/api/dias', (req, res) => {
    const { servico } = req.query;
    if (!servico) return res.status(400).json({ erro: 'Informe ?servico=' });
    res.json(booking.diasDisponiveis(servico));
  });

  // Horários livres de um serviço num dia
  app.get('/api/horarios', (req, res) => {
    const { servico, data } = req.query;
    if (!servico || !data) return res.status(400).json({ erro: 'Informe ?servico= e ?data=' });
    res.json(booking.horariosDisponiveis(servico, data));
  });

  // ---- Bloqueio de dias (folga / imprevisto) — PROTEGIDO por PIN ----

  // Lista os dias bloqueados (só os de hoje em diante), com contagem de
  // agendamentos que já existiam em cada dia (para o barbeiro decidir).
  app.get('/api/admin/bloqueios', exigirPin, (req, res) => {
    const hoje = dataLocalISO();
    const lista = db.listarBloqueios()
      .filter((b) => b.data >= hoje)
      .map((b) => ({
        ...b,
        agendamentos: db.listarAgendamentos({ status: 'confirmado', data: b.data }).length,
      }));
    res.json(lista);
  });

  // Bloqueia um dia inteiro. Body: { data: 'YYYY-MM-DD', motivo? }
  app.post('/api/admin/bloqueios', exigirPin, (req, res) => {
    const { data, motivo } = req.body || {};
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ erro: 'Informe a data no formato YYYY-MM-DD.' });
    }
    const bloqueio = db.bloquearDia(data, motivo);
    const agendamentos = db.listarAgendamentos({ status: 'confirmado', data }).length;
    res.status(201).json({ ...bloqueio, agendamentos });
  });

  // Desbloqueia um dia. Ex.: DELETE /api/admin/bloqueios/2026-08-10
  app.delete('/api/admin/bloqueios/:data', exigirPin, (req, res) => {
    const ok = db.desbloquearDia(req.params.data);
    if (!ok) return res.status(404).json({ erro: 'Esse dia não estava bloqueado.' });
    res.json({ ok: true });
  });

  // Diz se um dia específico está bloqueado (usado pela agenda do barbeiro)
  app.get('/api/admin/bloqueios/:data', exigirPin, (req, res) => {
    res.json({ data: req.params.data, bloqueado: db.diaBloqueado(req.params.data) });
  });

  // Lista de agendamentos (visão do barbeiro) — PROTEGIDO por PIN.
  app.get('/api/agendamentos', exigirPin, (req, res) => {
    const { data, de } = req.query;
    let lista = db.listarAgendamentos({ status: 'confirmado' });
    if (data) {
      lista = lista.filter((a) => a.data === data);
    } else {
      const inicio = de || dataLocalISO();
      lista = lista.filter((a) => a.data >= inicio);
    }
    res.json(lista);
  });

  // Cria um agendamento (usado pela agenda do barbeiro para encaixar clientes)
  app.post('/api/agendamentos', (req, res) => {
    const { servicoId, data, hora, cliente, telefone, origem } = req.body || {};
    const r = booking.agendar({ servicoId, data, hora, cliente, telefone, origem: origem || 'agenda' });
    if (!r.ok) return res.status(400).json({ erro: r.erro });
    res.status(201).json(r.agendamento);
  });

  // Cancela um agendamento — PROTEGIDO por PIN.
  app.post('/api/agendamentos/:id/cancelar', exigirPin, (req, res) => {
    const r = booking.cancelar(req.params.id);
    if (!r.ok) return res.status(404).json({ erro: r.erro });
    res.json(r.agendamento);
  });

  // ---- Arquivos estáticos da agenda (PWA) ----
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

function iniciarServidor() {
  const app = criarApp();
  const porta = process.env.PORT || config.porta || 3000;
  return app.listen(porta, () => {
    console.log(`\n🌐 Agenda no ar: http://localhost:${porta}`);
    console.log(`   (abra esse endereço no navegador do celular para instalar o app)\n`);
  });
}

// Se rodar direto (node src/server.js), sobe só o servidor
if (require.main === module) {
  iniciarServidor();
}

module.exports = { criarApp, iniciarServidor };
// ============================================================================
//  SERVIDOR WEB (API + agenda PWA)
//  Serve a agenda instalável no celular e expõe a API que tanto a agenda
//  quanto o bot de WhatsApp usam. Roda junto com o bot no mesmo processo.
// ============================================================================

// Fuso horário de Brasília (garante que "hoje" e os horários batam com o Brasil,
// mesmo com o servidor hospedado em outro país).
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const path = require('path');
const express = require('express');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
const botState = require('./botState');
const { dataLocalISO } = require('./slots');

// Gerador de QR em imagem (opcional — se não estiver instalado, devolvemos o texto)
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { /* opcional */ }

function criarApp() {
  const app = express();
  app.use(express.json());

  // ---- API ----

  // Middleware de segurança: exige o PIN do barbeiro no cabeçalho "x-admin-pin".
  // Protege as rotas que listam e cancelam agendamentos (visão do barbeiro).
  function exigirPin(req, res, next) {
    const pin = req.get('x-admin-pin') || req.query.pin;
    if (pin && String(pin) === String(config.adminPin)) return next();
    return res.status(401).json({ erro: 'PIN incorreto ou não informado.' });
  }

  // Endpoint para o app validar o PIN digitado na aba Agenda
  app.get('/api/admin/verificar', exigirPin, (req, res) => res.json({ ok: true }));

  // Status da conexão do WhatsApp + QR Code (protegido por PIN).
  // Retorna o QR já como imagem (data URL) para o app só exibir.
  app.get('/api/admin/whatsapp', exigirPin, async (req, res) => {
    const estado = botState.obter();
    let qrImagem = null;
    if (estado.status === 'qr' && estado.qr && QRCode) {
      try {
        qrImagem = await QRCode.toDataURL(estado.qr, { margin: 1, width: 320 });
      } catch (e) { /* ignora */ }
    }
    res.json({
      status: estado.status,     // desligado | iniciando | qr | conectado | desconectado
      numero: estado.numero || null,
      qrImagem,                  // data:image/png;base64,... (quando status = qr)
      qrTexto: estado.status === 'qr' ? estado.qr : null,
      botAtivo: process.env.SEM_BOT !== '1',
    });
  });

  // Informações públicas para o frontend montar a tela
  app.get('/api/config', (req, res) => {
    res.json({
      barbearia: config.barbearia,
      servicos: config.servicos,
      regras: config.regras,
    });
  });

  app.get('/api/servicos', (req, res) => {
    res.json(booking.listarServicos());
  });

  // Dias com vaga para um serviço
  app.get('/api/dias', (req, res) => {
    const { servico } = req.query;
    if (!servico) return res.status(400).json({ erro: 'Informe ?servico=' });
    res.json(booking.diasDisponiveis(servico));
  });

  // Horários livres de um serviço num dia
  app.get('/api/horarios', (req, res) => {
    const { servico, data } = req.query;
    if (!servico || !data) return res.status(400).json({ erro: 'Informe ?servico= e ?data=' });
    res.json(booking.horariosDisponiveis(servico, data));
  });

  // Lista de agendamentos (visão do barbeiro) — PROTEGIDO por PIN.
  app.get('/api/agendamentos', exigirPin, (req, res) => {
    const { data, de } = req.query;
    let lista = db.listarAgendamentos({ status: 'confirmado' });
    if (data) {
      lista = lista.filter((a) => a.data === data);
    } else {
      const inicio = de || dataLocalISO();
      lista = lista.filter((a) => a.data >= inicio);
    }
    res.json(lista);
  });

  // Cria um agendamento (usado pela agenda do barbeiro para encaixar clientes)
  app.post('/api/agendamentos', (req, res) => {
    const { servicoId, data, hora, cliente, telefone, origem } = req.body || {};
    const r = booking.agendar({ servicoId, data, hora, cliente, telefone, origem: origem || 'agenda' });
    if (!r.ok) return res.status(400).json({ erro: r.erro });
    res.status(201).json(r.agendamento);
  });

  // Cancela um agendamento — PROTEGIDO por PIN.
  app.post('/api/agendamentos/:id/cancelar', exigirPin, (req, res) => {
    const r = booking.cancelar(req.params.id);
    if (!r.ok) return res.status(404).json({ erro: r.erro });
    res.json(r.agendamento);
  });

  // ---- Arquivos estáticos da agenda (PWA) ----
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

function iniciarServidor() {
  const app = criarApp();
  const porta = process.env.PORT || config.porta || 3000;
  return app.listen(porta, () => {
    console.log(`\n🌐 Agenda no ar: http://localhost:${porta}`);
    console.log(`   (abra esse endereço no navegador do celular para instalar o app)\n`);
  });
}

// Se rodar direto (node src/server.js), sobe só o servidor
if (require.main === module) {
  iniciarServidor();
}

module.exports = { criarApp, iniciarServidor };
