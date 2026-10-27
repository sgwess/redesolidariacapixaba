/**
 * API SERVERLESS - REDE SOLIDÁRIA CSC
 * Endpoint: POST /api/sugerir
 * 
 * Submissão Pública Moderada de Empresas, Autônomos e Vagas.
 * BLINDAGEM DE SEGURANÇA:
 * - Honeypot anti-bot invisível.
 * - Time-trap de preenchimento mínimo (anti-spam automatizado).
 * - Sanitização rigorosa contra XSS e Formula Injection.
 * - TODOS os cadastros entram OBRIGATORIAMENTE com status "pendente".
 *   Eles NUNCA aparecem no catálogo público até serem conferidos e aprovados pela moderação.
 */

const { SEED_DATA } = require('../data/seed-data.js');

function sanitize(str, maxLen = 800) {
  if (str === null || str === undefined) return '';
  let cleaned = String(str)
    .replace(/<[^>]*>?/gm, '')
    .trim();
  if (/^[\=\+\-\@\t\r]/.test(cleaned)) {
    cleaned = "'" + cleaned;
  }
  return cleaned.slice(0, maxLen);
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Apenas método POST é permitido.' });
  }

  try {
    const body = req.body || {};

    // 1. Honeypot Anti-Bot: Se preenchido, descarta silenciosamente
    if (body.website_hp && String(body.website_hp).trim().length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Indicação recebida com sucesso para análise!'
      });
    }

    // 2. Time-Trap Anti-Bot: Requer pelo menos 2.5s para preenchimento humano
    if (body._renderTime) {
      const elapsed = Date.now() - Number(body._renderTime);
      if (elapsed < 2500) {
        return res.status(400).json({
          success: false,
          error: 'Envio muito rápido. Por favor, revise as informações com calma.'
        });
      }
    }

    const tipo = sanitize(body.tipo, 30);
    if (!['empresa', 'autonomo', 'vaga'].includes(tipo)) {
      return res.status(400).json({ success: false, error: 'Tipo inválido.' });
    }

    const nomePrincipal = sanitize(body.nome || body.titulo, 120);
    if (!nomePrincipal) {
      return res.status(400).json({ success: false, error: 'O nome ou título é obrigatório.' });
    }

    const newItem = {
      id: `${tipo.substring(0, 3)}-sug-${Date.now()}`,
      tipo: tipo,
      nome: nomePrincipal,
      titulo: tipo === 'vaga' ? nomePrincipal : '',
      razaoSocial: sanitize(body.razaoSocial, 150),
      profissao: sanitize(body.profissao, 120),
      empresaNome: sanitize(body.empresaNome, 120),
      categoria: sanitize(body.categoria, 80) || 'Geral',
      modalidade: sanitize(body.modalidade, 60),
      tipoContrato: sanitize(body.tipoContrato, 60),
      salario: sanitize(body.salario, 100),
      descricao: sanitize(body.descricao, 2000),
      beneficio: sanitize(body.beneficio, 400),
      cidade: sanitize(body.cidade, 80) || 'Vitória',
      bairro: sanitize(body.bairro, 80),
      endereco: sanitize(body.endereco, 250),
      mapsQuery: sanitize(body.mapsQuery || body.endereco, 200),
      logoUrl: sanitize(body.logoUrl, 1000),
      whatsapp: sanitize(body.whatsapp, 30).replace(/\D/g, ''),
      instagram: sanitize(body.instagram, 60).replace(/^@/, ''),
      site: sanitize(body.site, 200),
      portfolio: sanitize(body.portfolio, 200),
      telefone: sanitize(body.telefone, 30),
      horario: sanitize(body.horario, 100),
      canalCandidatura: sanitize(body.canalCandidatura, 100),
      emailCandidatura: sanitize(body.emailCandidatura, 100),
      prazo: sanitize(body.prazo, 100),
      regiaoAtendimento: sanitize(body.regiaoAtendimento, 120),
      dataCadastro: new Date().toISOString(),
      // TRAVA DE SEGURANÇA FUNDAMENTAL: Nunca vai direto para a vitrine
      status: 'pendente',
      origem: 'submissao_publica'
    };

    // Armazena na fila pendente
    SEED_DATA.push(newItem);

    const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    const cscSecret = process.env.CSC_API_SECRET || 'CSC_MILITANCIA_SEGURA_2026';

    if (sheetUrl) {
      try {
        await fetch(sheetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'suggest',
            secretToken: cscSecret,
            item: newItem
          })
        });
      } catch (sheetErr) {
        console.warn('Erro ao encaminhar sugestão para Sheets:', sheetErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Indicação enviada com sucesso! A coordenação do Coletivo avaliará as informações antes da publicação.'
    });

  } catch (err) {
    console.error('Erro na API /api/sugerir:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao registrar a indicação.'
    });
  }
};
