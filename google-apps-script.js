/**
 * ============================================================================
 * REDE SOLIDÁRIA - COLETIVO SOCIALISTA CAPIXABA
 * Google Apps Script - Banco de Dados em Planilha com Abas Separadas
 * ============================================================================
 * 
 * INSTRUÇÕES:
 * 1. Crie uma nova planilha no Google Sheets (ex: "CSC - Rede Solidária").
 * 2. Em Extensões > Apps Script, cole este código.
 * 3. Configure a constante SECRET_TOKEN abaixo (padrão: "CSC_MILITANCIA_SEGURA_2026").
 * 4. Clique em "Implantar" > "Nova implantação".
 * 5. Tipo: "App da Web" (Web app).
 * 6. Configurações obrigatórias:
 *    - Executar como: "Eu" (seu e-mail Google)
 *    - Quem pode acessar: "Qualquer pessoa" (Anyone) -> ESSENCIAL para permitir leitura/escrita em rede!
 * 7. Copie a URL gerada (termina em /exec) e cole no Painel de Gestão ou no config.js.
 * ============================================================================
 */

var SECRET_TOKEN = "CSC_MILITANCIA_SEGURA_2026";

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "public_list";
  var secret = (e && e.parameter && e.parameter.secret) || "";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(ss);

  // Ping de teste de conexão com a planilha
  if (action === "ping") {
    return createJsonResponse({
      success: true,
      status: "connected",
      message: "Conexão ativa com o Google Sheets da Rede Solidária CSC",
      totalSheets: ss.getSheets().length,
      timestamp: new Date().toISOString()
    });
  }

  // Leitura pública (apenas itens aprovados/ativos)
  if (action === "public_list") {
    var allItems = getAllItems(ss, true);
    return createJsonResponse(allItems);
  }

  // Leitura administrativa (requer segredo da militância)
  if (action === "admin_list") {
    if (secret !== SECRET_TOKEN) {
      return createJsonResponse({ error: "Não autorizado: token de segurança inválido." });
    }
    var adminItems = getAllItems(ss, false);
    return createJsonResponse(adminItems);
  }

  return createJsonResponse({ error: "Ação inválida solicitada." });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  // Aguarda até 15 segundos para evitar colisões simultâneas de escrita
  var hasLock = lock.tryLock(15000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ error: "Nenhum dado enviado no corpo da requisição." });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createJsonResponse({ error: "Formato JSON inválido: " + parseErr.message });
    }

    if (data.secretToken !== SECRET_TOKEN && data.action !== "suggest") {
      return createJsonResponse({ error: "Não autorizado: segredo da API inválido." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);

    var action = data.action;

    // Criar novo registro
    if (action === "create" || action === "suggest") {
      var item = data.item;
      if (!item) {
        return createJsonResponse({ error: "Item não especificado para cadastro." });
      }
      insertItem(ss, item);
      return createJsonResponse({ success: true, message: "Cadastro gravado com sucesso na planilha!" });
    }

    // Atualizar registro existente
    if (action === "update") {
      if (!data.id || !data.item) {
        return createJsonResponse({ error: "ID ou dados do item ausentes para atualização." });
      }
      var updated = updateItem(ss, data.id, data.item);
      return createJsonResponse({
        success: updated,
        message: updated ? "Registro atualizado com sucesso na planilha!" : "Registro não encontrado para atualização."
      });
    }

    // Excluir registro
    if (action === "delete") {
      if (!data.id) {
        return createJsonResponse({ error: "ID ausente para exclusão." });
      }
      var deleted = deleteItem(ss, data.id);
      return createJsonResponse({
        success: deleted,
        message: deleted ? "Registro removido com sucesso da planilha." : "Registro não encontrado para exclusão."
      });
    }

    // Alternar status (Ativo / Pendente)
    if (action === "toggle_status") {
      if (!data.id || !data.status) {
        return createJsonResponse({ error: "ID ou status ausentes." });
      }
      var toggled = updateStatus(ss, data.id, data.status);
      return createJsonResponse({
        success: toggled,
        message: toggled ? "Status atualizado com sucesso." : "Registro não encontrado."
      });
    }

    return createJsonResponse({ error: "Ação desconhecida: " + action });

  } catch (err) {
    return createJsonResponse({ error: "Erro interno no script: " + err.message });
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

// Inicializa as abas da planilha se não existirem
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

  // Remove aba padrão vazia ('Página1' ou 'Sheet1') se houver outras abas
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
  // Neutraliza fórmulas maliciosas no Sheets (=, +, -, @)
  if (/^[\=\+\-\@\t\r]/.test(s)) {
    s = "'" + s;
  }
  // Proteção contra o limite de 50.000 caracteres por célula do Google Sheets
  if (s.length > 48000) {
    s = s.substring(0, 48000);
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
    sanitizeVal(item.razaoSocial || item.profissao || item.empresaNome || item.tipoContrato),
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
      var status = String(row[2] || "ativo").toLowerCase().trim();
      if (onlyActive && status !== "ativo") continue;

      var obj = {
        id: id,
        tipo: m.tipo,
        dataCadastro: row[1],
        status: status,
        nome: String(row[3] || ""),
        titulo: m.tipo === "vaga" ? String(row[3] || "") : "",
        categoria: String(row[4] || "Geral"),
        cidade: String(row[5] || "Vitória"),
        bairro: String(row[6] || ""),
        endereco: String(row[7] || ""),
        mapsQuery: String(row[8] || ""),
        whatsapp: String(row[9] || ""),
        instagram: String(row[10] || ""),
        logoUrl: String(row[11] || ""),
        descricao: String(row[12] || ""),
        beneficio: m.tipo !== "vaga" ? String(row[13] || "") : "",
        salario: m.tipo === "vaga" ? String(row[13] || "") : "",
        razaoSocial: m.tipo === "empresa" ? String(row[14] || "") : "",
        profissao: m.tipo === "autonomo" ? String(row[14] || "") : "",
        empresaNome: m.tipo === "vaga" ? String(row[14] || "") : "",
        tipoContrato: m.tipo === "vaga" ? String(row[14] || "") : "",
        horario: m.tipo === "empresa" ? String(row[15] || "") : "",
        modalidade: m.tipo !== "empresa" ? String(row[15] || "") : "",
        site: m.tipo === "empresa" ? String(row[16] || "") : "",
        portfolio: m.tipo === "autonomo" ? String(row[16] || "") : "",
        canalCandidatura: m.tipo === "vaga" ? String(row[16] || "") : ""
      };
      items.push(obj);
    }
  });

  return items;
}

function updateItem(ss, id, item) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  var found = false;

  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        var r = i + 1;
        if (item.status) sheet.getRange(r, 3).setValue(sanitizeVal(item.status));
        if (item.nome || item.titulo) sheet.getRange(r, 4).setValue(sanitizeVal(item.nome || item.titulo));
        if (item.categoria !== undefined) sheet.getRange(r, 5).setValue(sanitizeVal(item.categoria));
        if (item.cidade !== undefined) sheet.getRange(r, 6).setValue(sanitizeVal(item.cidade));
        if (item.bairro !== undefined) sheet.getRange(r, 7).setValue(sanitizeVal(item.bairro));
        if (item.endereco !== undefined) sheet.getRange(r, 8).setValue(sanitizeVal(item.endereco));
        if (item.mapsQuery !== undefined) sheet.getRange(r, 9).setValue(sanitizeVal(item.mapsQuery));
        if (item.whatsapp !== undefined) sheet.getRange(r, 10).setValue(sanitizeVal(item.whatsapp));
        if (item.instagram !== undefined) sheet.getRange(r, 11).setValue(sanitizeVal(item.instagram));
        if (item.logoUrl !== undefined) sheet.getRange(r, 12).setValue(sanitizeVal(item.logoUrl));
        if (item.descricao !== undefined) sheet.getRange(r, 13).setValue(sanitizeVal(item.descricao));
        if (item.beneficio !== undefined || item.salario !== undefined) {
          sheet.getRange(r, 14).setValue(sanitizeVal(item.beneficio || item.salario));
        }
        var col15 = item.razaoSocial || item.profissao || item.empresaNome || item.tipoContrato;
        if (col15 !== undefined) sheet.getRange(r, 15).setValue(sanitizeVal(col15));
        var col16 = item.horario || item.modalidade;
        if (col16 !== undefined) sheet.getRange(r, 16).setValue(sanitizeVal(col16));
        var col17 = item.site || item.portfolio || item.canalCandidatura || item.emailCandidatura;
        if (col17 !== undefined) sheet.getRange(r, 17).setValue(sanitizeVal(col17));
        found = true;
        return;
      }
    }
  });

  return found;
}

function deleteItem(ss, id) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  var found = false;

  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        found = true;
        return;
      }
    }
  });

  return found;
}

function updateStatus(ss, id, status) {
  var sheets = ["Empresas", "Autonomos", "Vagas"];
  var found = false;

  sheets.forEach(function(sName) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.getRange(i + 1, 3).setValue(sanitizeVal(status));
        found = true;
        return;
      }
    }
  });

  return found;
}
