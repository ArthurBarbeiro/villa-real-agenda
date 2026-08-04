// ============================================================================
//  LÓGICA DE HORÁRIOS (pura, sem banco e sem WhatsApp — fácil de testar)
//  Calcula quais horários estão livres num dia, respeitando:
//   - horário de funcionamento do dia
//   - duração do serviço escolhido
//   - agendamentos já existentes (não deixa sobrepor)
//   - antecedência mínima (não deixa marcar em cima da hora)
// ============================================================================

// 'HH:MM' -> minutos desde a meia-noite
function horaParaMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// minutos -> 'HH:MM'
function minParaHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' -> dia da semana (0=domingo..6=sábado), sem depender de fuso
function diaDaSemana(dataStr) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  // UTC evita que o fuso horário jogue o dia pra frente/trás
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

// Gera todos os horários "candidatos" (início de slot) dentro do funcionamento do dia.
// Retorna array de minutos. Considera intervaloSlotMin de passo.
function candidatosDoDia(dataStr, config) {
  const dow = diaDaSemana(dataStr);
  const blocos = config.horarios[dow];
  if (!blocos) return []; // dia fechado
  const passo = config.regras.intervaloSlotMin;
  const candidatos = [];
  blocos.forEach((bloco, idx) => {
    const ini = horaParaMin(bloco.inicio);
    const fim = horaParaMin(bloco.fim);
    // O ÚLTIMO bloco do dia termina no horário de FECHAMENTO. Nesse bloco o
    // próprio fechamento também é um horário de início válido: o último
    // atendimento pode COMEÇAR no fechamento (19h/20h) e terminar um pouco
    // depois, independentemente da duração do serviço.
    // Nos blocos anteriores (ex.: manhã, que termina no almoço) o serviço
    // precisa caber dentro do bloco — não invade a pausa.
    const ehUltimoBloco = idx === blocos.length - 1;
    for (let t = ini; ehUltimoBloco ? t <= fim : t < fim; t += passo) {
      candidatos.push({ inicioMin: t, blocoFimMin: fim, estende: ehUltimoBloco });
    }
  });
  return candidatos;
}

// Dois intervalos [aIni,aFim) e [bIni,bFim) se sobrepõem?
function sobrepoe(aIni, aFim, bIni, bFim) {
  return aIni < bFim && bIni < aFim;
}

// Calcula os horários disponíveis para um serviço num dia.
//  dataStr: 'YYYY-MM-DD'
//  duracaoMin: duração do serviço escolhido
//  agendamentos: lista de agendamentos CONFIRMADOS (com .data, .hora, .duracaoMin)
//  agora: Date de referência (para antecedência mínima) — injetável para testes
// Retorna array de 'HH:MM'.
function horariosDisponiveis(dataStr, duracaoMin, agendamentos, config, agora = new Date(), bloqueios = []) {
  // Dia travado pelo barbeiro (folga/imprevisto): sem horários.
  if (bloqueios && bloqueios.some((b) => (b.data || b) === dataStr)) return [];

  const candidatos = candidatosDoDia(dataStr, config);
  if (candidatos.length === 0) return [];

  // Agendamentos confirmados desse dia, como intervalos em minutos
  const ocupados = agendamentos
    .filter((a) => a.status === 'confirmado' && a.data === dataStr)
    .map((a) => {
      const ini = horaParaMin(a.hora);
      return { ini, fim: ini + (a.duracaoMin || config.regras.intervaloSlotMin) };
    });

  // Limite de antecedência mínima (só se o dia for hoje)
  const hojeStr = dataLocalISO(agora);
  const ehHoje = dataStr === hojeStr;
  const minAgoraComAntecedencia = ehHoje
    ? agora.getHours() * 60 + agora.getMinutes() + config.regras.antecedenciaMinutosMin
    : -Infinity;

  const livres = [];
  for (const c of candidatos) {
    const ini = c.inicioMin;
    const fim = ini + duracaoMin;
    // 1) fora do último bloco, o serviço tem que caber dentro do bloco (não
    //    invade o almoço). No último bloco do dia, deixamos começar até o
    //    fechamento — o atendimento pode passar um pouco do horário de fechar.
    if (!c.estende && fim > c.blocoFimMin) continue;
    // 2) não pode ser antes da antecedência mínima
    if (ini < minAgoraComAntecedencia) continue;
    // 3) não pode sobrepor nenhum agendamento existente
    const conflita = ocupados.some((o) => sobrepoe(ini, fim, o.ini, o.fim));
    if (conflita) continue;
    livres.push(minParaHora(ini));
  }
  return livres;
}

// Data local (do computador) em 'YYYY-MM-DD'
function dataLocalISO(d = new Date()) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

// Soma dias a uma data 'YYYY-MM-DD'
function somarDias(dataStr, n) {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + n);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Lista os próximos dias (a partir de hoje) que estão ABERTOS e têm pelo menos
// um horário livre para o serviço. Retorna [{ data, dow, label }].
function proximosDiasComVaga(duracaoMin, agendamentos, config, agora = new Date(), bloqueios = []) {
  const dias = [];
  const hoje = dataLocalISO(agora);
  for (let i = 0; i <= config.regras.diasParaFrente; i++) {
    const dataStr = somarDias(hoje, i);
    const livres = horariosDisponiveis(dataStr, duracaoMin, agendamentos, config, agora, bloqueios);
    if (livres.length > 0) {
      dias.push({ data: dataStr, dow: diaDaSemana(dataStr), label: rotuloData(dataStr, agora) });
    }
  }
  return dias;
}

const NOMES_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// Rótulo amigável: "hoje", "amanhã" ou "segunda-feira, 04/08"
function rotuloData(dataStr, agora = new Date()) {
  const hoje = dataLocalISO(agora);
  const amanha = somarDias(hoje, 1);
  const [ano, mes, dia] = dataStr.split('-');
  const ddmm = `${dia}/${mes}`;
  if (dataStr === hoje) return `hoje (${ddmm})`;
  if (dataStr === amanha) return `amanhã (${ddmm})`;
  return `${NOMES_DIAS[diaDaSemana(dataStr)]}, ${ddmm}`;
}

module.exports = {
  horaParaMin,
  minParaHora,
  diaDaSemana,
  horariosDisponiveis,
  proximosDiasComVaga,
  dataLocalISO,
  somarDias,
  rotuloData,
  NOMES_DIAS,
};
