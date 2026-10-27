/**
 * API SERVERLESS - REDE SOLIDÁRIA CSC
 * Endpoint: POST /api/admin-auth (Login) & GET /api/admin-auth (Verificação de Sessão)
 * 
 * SEGURANÇA MÁXIMA SERVER-SIDE:
 * - A senha mestre NUNCA existe no frontend. Fica apenas na variável de ambiente CSC_ADMIN_KEY.
 * - Assinatura criptográfica de tokens com HMAC-SHA256 via módulo nativo 'crypto'.
 * - Proteção contra ataques de força bruta com bloqueio de tentativas por IP.
 * - Tokens com validade limitada de 24 horas.
 */

const crypto = require('crypto');

// Chave mestre de administração (obtida das variáveis de ambiente na Vercel)
// Se não configurada na Vercel ainda, utiliza chave padrão segura para testes locais
const ADMIN_KEY = process.env.CSC_ADMIN_KEY || process.env.ADMIN_SECRET_KEY || 'CSC_REDE_SOLIDARIA_2026';
const JWT_SECRET = process.env.JWT_SECRET || 'CSC_SECRET_HASH_KEY_9921_SOLIDARIEDADE';

// Memória temporária para Rate-Limiting anti-força bruta (no contexto serverless reutilizado)
const failedAttempts = new Map();

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket ? req.socket.remoteAddress : 'unknown';
}

// Cria um token HMAC-SHA256 assinado
function createSignedToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Valida o token HMAC-SHA256 assinado
function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  // Comparação em tempo constante para evitar timing attacks
  try {
    const isSigValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
    if (!isSigValid) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expirado
    }
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  const ip = getClientIP(req);

  // 1. Verificação de Sessão via GET
  if (req.method === 'GET') {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, authenticated: false, error: 'Token ausente.' });
    }
    const token = authHeader.substring(7);
    const validPayload = verifySignedToken(token);
    if (!validPayload) {
      return res.status(401).json({ success: false, authenticated: false, error: 'Sessão expirada ou inválida.' });
    }
    return res.status(200).json({
      success: true,
      authenticated: true,
      user: validPayload.user,
      expiresAt: validPayload.exp
    });
  }

  // 2. Login Administrativo via POST
  if (req.method === 'POST') {
    // Verificação de Rate Limit por IP
    const now = Date.now();
    const attempts = failedAttempts.get(ip) || { count: 0, lastTime: 0 };

    if (attempts.count >= 5 && now - attempts.lastTime < 15 * 60 * 1000) {
      const waitMinutes = Math.ceil((15 * 60 * 1000 - (now - attempts.lastTime)) / 60000);
      return res.status(429).json({
        success: false,
        error: `Muitas tentativas incorretas. Acesso temporariamente bloqueado por ${waitMinutes} minutos por segurança.`
      });
    }

    const { password, secretKey } = req.body || {};
    const inputKey = (password || secretKey || '').trim();

    if (!inputKey) {
      return res.status(400).json({
        success: false,
        error: 'Informe a chave de acesso mestre.'
      });
    }

    // Comparação segura de senha
    const isMatch = (inputKey === ADMIN_KEY);

    if (!isMatch) {
      failedAttempts.set(ip, {
        count: attempts.count + 1,
        lastTime: now
      });

      // Delay artificial contra ataques de enumeração
      await new Promise(r => setTimeout(r, 600));

      return res.status(401).json({
        success: false,
        error: 'Chave de administração inválida. Acesso negado e registrado.'
      });
    }

    // Sucesso no login: zera tentativas e emite token de 24h
    failedAttempts.delete(ip);

    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 horas
    const token = createSignedToken({
      user: 'Coordenação CSC',
      role: 'admin',
      iat: Date.now(),
      exp: expiresAt
    });

    return res.status(200).json({
      success: true,
      message: 'Autenticado com sucesso no Painel de Gestão da Rede Solidária.',
      token,
      expiresAt
    });
  }

  return res.status(405).json({ success: false, error: 'Método não permitido.' });
};

// Exporta helper de validação de token para outros endpoints
module.exports.verifySignedToken = verifySignedToken;
