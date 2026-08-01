// ============================================================================
//  SERVIDOR WEB (API + agenda PWA)
//  Serve a agenda instalável no celular e expõe a API que tanto a agenda
//  quanto o bot de WhatsApp usam. Roda junto com o bot no mesmo processo.
// ============================================================================

const path = require('path');
const express = require('express');
const config = require('../config');
const booking = require('./booking');
const db = require('./db');
const { dataLocalISO } = require('./slots');

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
