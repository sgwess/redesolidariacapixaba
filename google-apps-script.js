/**
 * ============================================================================
 * REDE SOLIDÁRIA - COLETIVO SOCIALISTA CAPIXABA
 * Google Apps Script - Banco de Dados em Planilha com Abas Separadas
 * ============================================================================
 * 
 * INSTRUÇÕES:
 * 1. Crie uma nova planilha no Google Sheets (ex: "CSC - Rede Solidária").
 * 2. Em Extensões > Apps Script, cole este código.
 * 3. Configure a constante SECRET_TOKEN abaixo.
 * 4. Implante como App da Web (Executar como: Eu, Quem acessa: Qualquer pessoa).
 * 5. Adicione a URL gerada na Vercel: GOOGLE_SHEET_WEBHOOK_URL
 * ============================================================================
 */

var SECRET_TOKEN = "CSC_MILITANCIA_SEGURA_2026";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "public_list";
  var secret = (e && e.parameter && e.parameter.secret) || "";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(ss);

  // Leitura pública (apenas itens ativos)
  if (action === "public_list") {
    var allItems = getAllItems(ss, true);
    return ContentService.createTextOutput(JSON.stringify(allItems))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Leitura administrativa (requer segredo)
  if (action === "admin_list") {
    if (secret !== SECRET_TOKEN) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Não autorizado" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var adminItems = getAllItems(ss, false);
    return ContentService.createTextOutput(JSON.stringify(adminItems))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ error: "Ação inválida" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ error: "Sem dados" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    if (data.secretToken !== SECRET_TOKEN && data.action !== "suggest") {
      return ContentService.createTextOutput(JSON.stringify({ error: "Não autorizado" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    var action = data.action;

    if (action === "create" || action === "suggest") {
      var item = data.item;
      insertItem(ss, item);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Gravado com sucesso" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "update") {
      updateItem(ss, data.id, data.item);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Atualizado com sucesso" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "delete") {
      deleteItem(ss, data.id);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Removido com sucesso" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === "toggle_status") {
      updateStatus(ss, data.id, data.status);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Status alterado" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "Ação desconhecida" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Inicializa as abas se não existirem
function ensureSheets(ss) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  var headers = [
    "ID", "Data Cadastro", "Status", "Nome / Título", "Categoria", "Cidade", "Bairro",
    "Endereço Completo", "Maps Query", "WhatsApp", "Instagram", "Logo URL", "Descrição",
    "Benefício / Salário", "Razão Social / Profissão / Contrato", "Horário / Modalidade",
    "Site / Portfólio / Candidatura"
  ];

  sheets.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground("#c8102e")
        .setFontColor("#ffffff")
        .setFontWeight("bold")
        .setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
    }
  });

  // Remove aba padrão 'Página1' se estiver vazia
  var defaultSheet = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch(e){}
  }
}

function getSheetForType(ss, tipo) {
  if (tipo === "empresa") return ss.getSheetByName("Empresas");
  if (tipo === "autonomo") return ss.getSheetByName("Autonomos");
  if (tipo === "vaga") return ss.getSheetByName("Vagas");
  return ss.getSheetByName("Empresas");
}

function sanitizeVal(v) {
  if (v === null || v === undefined) return "";
  var s = String(v).trim();
  if (/^[\=\+\-\@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return s;
}

function insertItem(ss, item) {
  var sheet = getSheetForType(ss, item.tipo);
  var row = [
    sanitizeVal(item.id),
    sanitizeVal(item.dataCadastro || new Date().toISOString()),
    sanitizeVal(item.status || "ativo"),
    sanitizeVal(item.nome || item.titulo),
    sanitizeVal(item.categoria),
    sanitizeVal(item.cidade),
    sanitizeVal(item.bairro),
    sanitizeVal(item.endereco),
    sanitizeVal(item.mapsQuery),
    sanitizeVal(item.whatsapp),
    sanitizeVal(item.instagram),
    sanitizeVal(item.logoUrl),
    sanitizeVal(item.descricao),
    sanitizeVal(item.beneficio || item.salario),
    sanitizeVal(item.razaoSocial || item.profissao || item.tipoContrato),
    sanitizeVal(item.horario || item.modalidade),
    sanitizeVal(item.site || item.portfolio || item.canalCandidatura || item.emailCandidatura)
  ];
  sheet.appendRow(row);
}

function getAllItems(ss, onlyActive) {
  var items = [];
  var mapping = [
    { name: "Empresas", tipo: "empresa" },
    { name: "Autonomos", tipo: "autonomo" },
    { name: "Vagas", tipo: "vaga" }
  ];

  mapping.forEach(function(m) {
    var sheet = ss.getSheetByName(m.name);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return;

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var id = String(row[0] || "");
      if (!id) continue;
      var status = String(row[2] || "ativo");
      if (onlyActive && status !== "ativo") continue;

      var obj = {
        id: id,
        tipo: m.tipo,
        dataCadastro: row[1],
        status: status,
        nome: row[3],
        titulo: m.tipo === "vaga" ? row[3] : "",
        categoria: row[4],
        cidade: row[5],
        bairro: row[6],
        endereco: row[7],
        mapsQuery: row[8],
        whatsapp: row[9],
        instagram: row[10],
        logoUrl: row[11],
        descricao: row[12],
        beneficio: m.tipo !== "vaga" ? row[13] : "",
        salario: m.tipo === "vaga" ? row[13] : "",
        razaoSocial: m.tipo === "empresa" ? row[14] : "",
        profissao: m.tipo === "autonomo" ? row[14] : "",
        empresaNome: m.tipo === "vaga" ? row[14] : "",
        tipoContrato: m.tipo === "vaga" ? row[14] : "",
        horario: m.tipo === "empresa" ? row[15] : "",
        modalidade: m.tipo !== "empresa" ? row[15] : "",
        site: m.tipo === "empresa" ? row[16] : "",
        portfolio: m.tipo === "autonomo" ? row[16] : "",
        canalCandidatura: m.tipo === "vaga" ? row[16] : ""
      };
      items.push(obj);
    }
  });

  return items;
}

function updateItem(ss, id, item) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        var r = i + 1;
        if (item.nome || item.titulo) sheet.getRange(r, 4).setValue(sanitizeVal(item.nome || item.titulo));
        if (item.categoria) sheet.getRange(r, 5).setValue(sanitizeVal(item.categoria));
        if (item.cidade) sheet.getRange(r, 6).setValue(sanitizeVal(item.cidade));
        if (item.bairro) sheet.getRange(r, 7).setValue(sanitizeVal(item.bairro));
        if (item.endereco) sheet.getRange(r, 8).setValue(sanitizeVal(item.endereco));
        if (item.mapsQuery) sheet.getRange(r, 9).setValue(sanitizeVal(item.mapsQuery));
        if (item.whatsapp) sheet.getRange(r, 10).setValue(sanitizeVal(item.whatsapp));
        if (item.instagram) sheet.getRange(r, 11).setValue(sanitizeVal(item.instagram));
        if (item.logoUrl) sheet.getRange(r, 12).setValue(sanitizeVal(item.logoUrl));
        if (item.descricao) sheet.getRange(r, 13).setValue(sanitizeVal(item.descricao));
        if (item.beneficio || item.salario) sheet.getRange(r, 14).setValue(sanitizeVal(item.beneficio || item.salario));
        if (item.status) sheet.getRange(r, 3).setValue(sanitizeVal(item.status));
        return;
      }
    }
  });
}

function deleteItem(ss, id) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return;
      }
    }
  });
}

function updateStatus(ss, id, status) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 3).setValue(sanitizeVal(status));
        return;
      }
    }
  });
}
