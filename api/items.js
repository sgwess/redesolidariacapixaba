/**
 * API SERVERLESS - REDE SOLIDÁRIA CSC
 * Endpoint: GET /api/items
 * 
 * Retorna os itens públicos ativos (Empresas, Autônomos e Vagas de Emprego).
 * Proteção total: nunca expõe itens pendentes ou dados privados de moderação.
 */

const { SEED_DATA } = require('../data/seed-data.js');

module.exports = async function handler(req, res) {
  // Headers de segurança e controle de cache
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Método não permitido. Utilize GET.'
    });
  }

  try {
    const { tipo, categoria, cidade, q } = req.query;

    let items = [...SEED_DATA];
    let hasRemoteSheet = false;
    let sheetError = null;

    // Se houver Google Sheets configurado na variável de ambiente do Vercel, busca atualizações
    const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (sheetUrl && sheetUrl.startsWith('http')) {
      try {
        const controller = new AbortController();
        // Apps Script pode levar alguns segundos em cold start
        const timeoutId = setTimeout(() => controller.abort(), 9500);
        const resp = await fetch(`${sheetUrl}?action=public_list`, {
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const remoteData = await resp.json();
          if (Array.isArray(remoteData)) {
            // Mescla dados remotos aprovados
            const approvedRemote = remoteData.filter(i => i.status === 'ativo');
            if (approvedRemote.length > 0) {
              items = approvedRemote;
              hasRemoteSheet = true;
            } else if (remoteData.length === 0) {
              // A planilha existe mas está vazia
              hasRemoteSheet = true;
            }
          }
        } else {
          sheetError = `HTTP ${resp.status}: ${resp.statusText}`;
        }
      } catch (fetchErr) {
        sheetError = fetchErr.name === 'AbortError' ? 'Tempo limite esgotado ao contatar Google Sheets' : fetchErr.message;
        console.warn('Aviso: usando fallback local para itens públicos:', sheetError);
      }
    }

    // Filtra apenas registros ativos
    items = items.filter(item => item.status === 'ativo');

    // Filtro por Tipo (empresa, autonomo, vaga)
    if (tipo && tipo !== 'todos') {
      items = items.filter(item => item.tipo === tipo);
    }

    // Filtro por Categoria
    if (categoria && categoria !== 'todas') {
      items = items.filter(item => 
        (item.categoria && item.categoria.toLowerCase() === categoria.toLowerCase())
      );
    }

    // Filtro por Cidade
    if (cidade && cidade !== 'todas') {
      items = items.filter(item => 
        (item.cidade && item.cidade.toLowerCase().includes(cidade.toLowerCase()))
      );
    }

    // Busca textual inteligente (nome, descrição, profissão, cargo, endereço)
    if (q && q.trim().length > 0) {
      const term = q.trim().toLowerCase();
      items = items.filter(item => {
        const nome = (item.nome || item.titulo || '').toLowerCase();
        const desc = (item.descricao || '').toLowerCase();
        const prof = (item.profissao || item.empresaNome || '').toLowerCase();
        const cat = (item.categoria || '').toLowerCase();
        const end = (item.endereco || item.bairro || '').toLowerCase();
        return nome.includes(term) || desc.includes(term) || prof.includes(term) || cat.includes(term) || end.includes(term);
      });
    }

    return res.status(200).json({
      success: true,
      hasRemoteSheet: hasRemoteSheet,
      sheetConfigured: Boolean(sheetUrl),
      sheetError: sheetError,
      total: items.length,
      data: items
    });

  } catch (err) {
    console.error('Erro na API /api/items:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao consultar itens da Rede Solidária.'
    });
  }
};
