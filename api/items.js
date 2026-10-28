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

    // Se houver Google Sheets configurado, busca atualizações
    const sheetUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
    if (sheetUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const resp = await fetch(`${sheetUrl}?action=public_list`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const remoteData = await resp.json();
          if (Array.isArray(remoteData) && remoteData.length > 0) {
            // Mescla dados remotos aprovados
            const approvedRemote = remoteData.filter(i => i.status === 'ativo');
            if (approvedRemote.length > 0) {
              items = approvedRemote;
            }
          }
        }
      } catch (fetchErr) {
        // Fallback silencioso para os dados locais caso o Google Sheets demore ou oscile
        console.warn('Aviso: usando fallback local para itens públicos:', fetchErr.message);
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
      hasRemoteSheet: Boolean(sheetUrl),
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
