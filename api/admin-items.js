/**
 * API SERVERLESS - REDE SOLIDÁRIA CSC
 * Endpoint: /api/admin-items
 * Métodos: GET, POST, PUT, DELETE, PATCH
 * 
 * ÁREA RESTRITA: Exige cabeçalho 'Authorization: Bearer <token>'
 * Token assinado por HMAC-SHA256 validado no backend.
 */

const { verifySignedToken } = require('./admin-auth.js');
let { SEED_DATA } = require('../data/seed-data.js');

// Sanitização de entradas contra XSS e Formula Injection
function sanitizeInput(str, maxLen = 1000) {
  if (str === null || str === undefined) return '';
  let cleaned = String(str)
    .replace(/<[^>]*>?/gm, '') // Remove tags HTML/scripts
    .trim();

  // Neutralização contra Formula Injection no Sheets/Excel
  if (/^[\=\+\-\@\t\r]/.test(cleaned)) {
    cleaned = "'" + cleaned;
  }
  return cleaned.slice(0, maxLen);
}

// Validação segura de URL ou Base64 de imagem
function sanitizeMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  url = url.trim();
  // Permite data:image (upload local base64/webp)
  if (url.startsWith('data:image/')) {
    // Limite máximo de segurança para imagem Base64 em payload (~40KB para segurança do Sheets)
    if (url.length > 50000) return '';
    return url;
  }
  // Permite apenas http e https válidos
  if (/^https?:\/\/[a-zA-Z0-9\-\._~:\/\?#\[\]@!$&'\(\)\*\+,;=%]+$/i.test(url)) {
    return url;
  }
  return '';
}

// Helper para chamada segura ao Google Apps Script
async function callSheet(sheetUrl, payload, timeoutMs = 11000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(sheetUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const text = await resp.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = { raw: text };
    }

    return {
      ok: resp.ok,
      status: resp.status,
      data: json,
      error: resp.ok && (json.success || !json.error) ? null : (json.error || `HTTP ${resp.status}`)
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      status: 0,
      data: null,
      error: err.name === 'AbortError' ? 'Tempo limite esgotado ao sincronizar com Google Sheets' : err.message
    };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // 1. Validação Obrigatória de Autenticação Server-Side
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado. Token de autenticação administrativo não fornecido.'
    });
  }

  const token = authHeader.substring(7);
  const session = verifySignedToken(token);
  if (!session) {
    return res.status(401).json({
      success: false,
      error: 'Sessão expirada ou não autorizada. Faça login novamente no painel seguro.'
    });
  }

  const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const cscSecret = process.env.CSC_API_SECRET || 'CSC_MILITANCIA_SEGURA_2026';

  try {
    // ==========================================
    // GET: Listar todos os itens (ativos + pendentes)
    // ==========================================
    if (req.method === 'GET') {
      let items = [...SEED_DATA];
      let hasRemoteSheet = false;
      let sheetError = null;

      if (sheetUrl && sheetUrl.startsWith('http')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const resp = await fetch(`${sheetUrl}?action=admin_list&secret=${encodeURIComponent(cscSecret)}`, {
            signal: controller.signal,
            redirect: 'follow'
          });
          clearTimeout(timeoutId);

          if (resp.ok) {
            const remoteData = await resp.json();
            if (Array.isArray(remoteData)) {
              items = remoteData;
              hasRemoteSheet = true;
            }
          } else {
            sheetError = `HTTP ${resp.status}: ${resp.statusText}`;
          }
        } catch (fetchErr) {
          sheetError = fetchErr.name === 'AbortError' ? 'Tempo limite esgotado ao buscar lista da planilha' : fetchErr.message;
          console.warn('Google Sheets indisponível para admin GET:', sheetError);
        }
      }

      return res.status(200).json({
        success: true,
        hasRemoteSheet: hasRemoteSheet,
        sheetConfigured: Boolean(sheetUrl),
        sheetError: sheetError,
        total: items.length,
        data: items
      });
    }

    // ==========================================
    // POST: Cadastrar novo item diretamente
    // ==========================================
    if (req.method === 'POST') {
      const body = req.body || {};
      const tipo = sanitizeInput(body.tipo, 30);

      if (!['empresa', 'autonomo', 'vaga'].includes(tipo)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo inválido. Deve ser: empresa, autonomo ou vaga.'
        });
      }

      const nomePrincipal = sanitizeInput(body.nome || body.titulo, 120);
      if (!nomePrincipal) {
        return res.status(400).json({
          success: false,
          error: 'O nome ou título é obrigatório.'
        });
      }

      const newItem = {
        id: `${tipo.substring(0, 3)}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        tipo: tipo,
        nome: nomePrincipal,
        titulo: tipo === 'vaga' ? nomePrincipal : '',
        razaoSocial: sanitizeInput(body.razaoSocial, 150),
        profissao: sanitizeInput(body.profissao, 120),
        empresaNome: sanitizeInput(body.empresaNome, 120),
        categoria: sanitizeInput(body.categoria, 80) || 'Geral',
        modalidade: sanitizeInput(body.modalidade, 60),
        tipoContrato: sanitizeInput(body.tipoContrato, 60),
        salario: sanitizeInput(body.salario, 100),
        descricao: sanitizeInput(body.descricao, 2500),
        beneficio: sanitizeInput(body.beneficio, 500),
        cidade: sanitizeInput(body.cidade, 80) || 'Vitória',
        bairro: sanitizeInput(body.bairro, 80),
        endereco: sanitizeInput(body.endereco, 250),
        mapsQuery: sanitizeInput(body.mapsQuery || body.endereco, 200),
        logoUrl: sanitizeMediaUrl(body.logoUrl),
        whatsapp: sanitizeInput(body.whatsapp, 30).replace(/\D/g, ''),
        instagram: sanitizeInput(body.instagram, 60).replace(/^@/, ''),
        site: sanitizeInput(body.site, 200),
        portfolio: sanitizeInput(body.portfolio, 200),
        telefone: sanitizeInput(body.telefone, 30),
        horario: sanitizeInput(body.horario, 100),
        canalCandidatura: sanitizeInput(body.canalCandidatura, 100),
        emailCandidatura: sanitizeInput(body.emailCandidatura, 100),
        prazo: sanitizeInput(body.prazo, 100),
        regiaoAtendimento: sanitizeInput(body.regiaoAtendimento, 120),
        dataCadastro: new Date().toISOString(),
        status: body.status === 'pendente' ? 'pendente' : 'ativo'
      };

      // Adiciona em memória local / seed
      SEED_DATA.unshift(newItem);

      let sheetSync = { ok: false, error: 'Planilha não configurada nas variáveis da Vercel' };

      // Sincroniza com o Google Sheets se disponível
      if (sheetUrl && sheetUrl.startsWith('http')) {
        sheetSync = await callSheet(sheetUrl, {
          action: 'create',
          secretToken: cscSecret,
          item: newItem
        });
      }

      return res.status(201).json({
        success: true,
        message: sheetSync.ok 
          ? 'Cadastro realizado e sincronizado na Planilha Google com sucesso!'
          : 'Cadastro gravado no servidor local CSC. Atenção: sincronização com a planilha falhou: ' + sheetSync.error,
        sheetSynced: sheetSync.ok,
        sheetError: sheetSync.error,
        item: newItem
      });
    }

    // ==========================================
    // PUT: Editar item existente
    // ==========================================
    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = sanitizeInput(body.id, 60);

      if (!id) {
        return res.status(400).json({ success: false, error: 'ID do registro não informado.' });
      }

      const index = SEED_DATA.findIndex(i => i.id === id);

      const updatedFields = {
        ...((index !== -1) ? SEED_DATA[index] : {}),
        nome: sanitizeInput(body.nome || body.titulo, 120),
        titulo: body.tipo === 'vaga' ? sanitizeInput(body.nome || body.titulo, 120) : '',
        razaoSocial: sanitizeInput(body.razaoSocial, 150),
        profissao: sanitizeInput(body.profissao, 120),
        empresaNome: sanitizeInput(body.empresaNome, 120),
        categoria: sanitizeInput(body.categoria, 80),
        modalidade: sanitizeInput(body.modalidade, 60),
        tipoContrato: sanitizeInput(body.tipoContrato, 60),
        salario: sanitizeInput(body.salario, 100),
        descricao: sanitizeInput(body.descricao, 2500),
        beneficio: sanitizeInput(body.beneficio, 500),
        cidade: sanitizeInput(body.cidade, 80),
        bairro: sanitizeInput(body.bairro, 80),
        endereco: sanitizeInput(body.endereco, 250),
        mapsQuery: sanitizeInput(body.mapsQuery || body.endereco, 200),
        logoUrl: body.logoUrl ? sanitizeMediaUrl(body.logoUrl) : (index !== -1 ? SEED_DATA[index].logoUrl : ''),
        whatsapp: sanitizeInput(body.whatsapp, 30).replace(/\D/g, ''),
        instagram: sanitizeInput(body.instagram, 60).replace(/^@/, ''),
        site: sanitizeInput(body.site, 200),
        portfolio: sanitizeInput(body.portfolio, 200),
        telefone: sanitizeInput(body.telefone, 30),
        horario: sanitizeInput(body.horario, 100),
        canalCandidatura: sanitizeInput(body.canalCandidatura, 100),
        emailCandidatura: sanitizeInput(body.emailCandidatura, 100),
        prazo: sanitizeInput(body.prazo, 100),
        regiaoAtendimento: sanitizeInput(body.regiaoAtendimento, 120),
        status: body.status || 'ativo',
        dataAtualizacao: new Date().toISOString()
      };

      if (index !== -1) {
        SEED_DATA[index] = { ...SEED_DATA[index], ...updatedFields };
      }

      let sheetSync = { ok: false, error: 'Planilha não configurada' };
      if (sheetUrl && sheetUrl.startsWith('http')) {
        sheetSync = await callSheet(sheetUrl, {
          action: 'update',
          secretToken: cscSecret,
          id: id,
          item: updatedFields
        });
      }

      return res.status(200).json({
        success: true,
        message: sheetSync.ok 
          ? 'Registro atualizado e sincronizado na Planilha Google com sucesso!'
          : 'Registro atualizado localmente.',
        sheetSynced: sheetSync.ok,
        sheetError: sheetSync.error,
        item: updatedFields
      });
    }

    // ==========================================
    // DELETE: Excluir item
    // ==========================================
    if (req.method === 'DELETE') {
      const id = sanitizeInput(req.query.id || (req.body && req.body.id), 60);
      if (!id) {
        return res.status(400).json({ success: false, error: 'ID do registro obrigatório.' });
      }

      SEED_DATA = SEED_DATA.filter(i => i.id !== id);

      let sheetSync = { ok: false, error: 'Planilha não configurada' };
      if (sheetUrl && sheetUrl.startsWith('http')) {
        sheetSync = await callSheet(sheetUrl, {
          action: 'delete',
          secretToken: cscSecret,
          id: id
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Registro removido da Rede Solidária.',
        sheetSynced: sheetSync.ok,
        sheetError: sheetSync.error
      });
    }

    // ==========================================
    // PATCH: Alternar status (Aprovar / Ocultar)
    // ==========================================
    if (req.method === 'PATCH') {
      const { id, status } = req.body || {};
      const cleanId = sanitizeInput(id, 60);
      const newStatus = status === 'ativo' ? 'ativo' : 'pendente';

      const item = SEED_DATA.find(i => i.id === cleanId);
      if (item) {
        item.status = newStatus;
      }

      let sheetSync = { ok: false, error: 'Planilha não configurada' };
      if (sheetUrl && sheetUrl.startsWith('http')) {
        sheetSync = await callSheet(sheetUrl, {
          action: 'toggle_status',
          secretToken: cscSecret,
          id: cleanId,
          status: newStatus
        });
      }

      return res.status(200).json({
        success: true,
        message: `Status atualizado para "${newStatus}".`,
        sheetSynced: sheetSync.ok,
        sheetError: sheetSync.error
      });
    }

    return res.status(405).json({ success: false, error: 'Método não permitido.' });

  } catch (err) {
    console.error('Erro na API /api/admin-items:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar operação administrativa.'
    });
  }
};
