/**
 * REDE SOLIDÁRIA - COLETIVO SOCIALISTA CAPIXABA
 * Configuração de Conexão com a Planilha Google (Apps Script)
 * 
 * Se você não configurou a variável de ambiente GOOGLE_SHEET_WEBHOOK_URL na Vercel,
 * você pode colar a URL do seu Google Apps Script diretamente abaixo para que
 * todos os dispositivos, celulares e abas anônimas acessem a planilha em rede.
 */

window.CSC_CONFIG = window.CSC_CONFIG || {
  // Cole aqui a URL gerada pelo Google Apps Script (termina em /exec)
  // Exemplo: "https://script.google.com/macros/s/AKfycb.../exec"
  googleSheetWebhookUrl: ""
};
