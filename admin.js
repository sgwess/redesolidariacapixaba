/**
 * REDE SOLIDÁRIA - COLETIVO SOCIALISTA CAPIXABA
 * Lógica do Painel de Gestão e Blindagem Administrativa
 */

(function () {
  'use strict';

  const TOKEN_KEY = 'CSC_ADMIN_TOKEN';
  const STORAGE_KEY = 'CSC_REDE_SOLIDARIA_DATA_V1';
  const SHEET_URL_KEY = 'CSC_SHEET_WEBHOOK_URL';
  const CSC_API_SECRET = 'CSC_MILITANCIA_SEGURA_2026';

  function getSheetWebhookUrl() {
    if (window.CSC_CONFIG && window.CSC_CONFIG.googleSheetWebhookUrl) {
      return window.CSC_CONFIG.googleSheetWebhookUrl.trim();
    }
    return (localStorage.getItem(SHEET_URL_KEY) || '').trim();
  }

  function setSheetWebhookUrl(url) {
    const clean = (url || '').trim();
    if (clean) {
      localStorage.setItem(SHEET_URL_KEY, clean);
      if (window.CSC_CONFIG) window.CSC_CONFIG.googleSheetWebhookUrl = clean;
    } else {
      localStorage.removeItem(SHEET_URL_KEY);
      if (window.CSC_CONFIG) window.CSC_CONFIG.googleSheetWebhookUrl = '';
    }
  }

  function saveToStorage(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.warn('Falha ao gravar no localStorage:', err);
    }
  }

  function getFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.warn('Falha ao ler do localStorage:', err);
    }
    return null;
  }

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || '',
    items: [],
    editingItemId: null,
    currentFormType: 'empresa',
    currentLogoBase64: '',
    listFilter: 'todos',
    sheetUrl: getSheetWebhookUrl(),
    isSheetConnected: false
  };

  // Elementos do DOM
  const dom = {
    authSection: document.getElementById('authSection'),
    adminSection: document.getElementById('adminSection'),
    authForm: document.getElementById('authForm'),
    authPasswordInput: document.getElementById('authPassword'),
    authErrorNotice: document.getElementById('authErrorNotice'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),

    // Painel de Integração Google Sheets
    sheetConnectionPanel: document.getElementById('sheetConnectionPanel'),
    sheetStatusDot: document.getElementById('sheetStatusDot'),
    sheetStatusBadge: document.getElementById('sheetStatusBadge'),
    sheetStatusDescription: document.getElementById('sheetStatusDescription'),
    btnToggleSheetConfig: document.getElementById('btnToggleSheetConfig'),
    btnForceSyncSheet: document.getElementById('btnForceSyncSheet'),
    sheetConfigDrawer: document.getElementById('sheetConfigDrawer'),
    inputSheetWebhookUrl: document.getElementById('inputSheetWebhookUrl'),
    btnSaveSheetUrl: document.getElementById('btnSaveSheetUrl'),

    // Top Admin Nav
    adminLogoutBtn: document.getElementById('adminLogoutBtn'),
    refreshListBtn: document.getElementById('refreshListBtn'),
    btnToggleNovoCadastro: document.getElementById('btnToggleNovoCadastro'),
    btnCloseForm: document.getElementById('btnCloseForm'),

    // Stats
    statAdminTotal: document.getElementById('statAdminTotal'),
    statAdminAtivos: document.getElementById('statAdminAtivos'),
    statAdminPendentes: document.getElementById('statAdminPendentes'),

    // Formulário
    formCard: document.getElementById('formCardAdmin'),
    formTitle: document.getElementById('formTitle'),
    formSubtitle: document.getElementById('formSubtitle'),
    itemForm: document.getElementById('itemForm'),
    formTypeTabs: document.querySelectorAll('.type-selector-tab'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    submitFormBtn: document.getElementById('submitFormBtn'),

    // Logo Upload
    uploadInput: document.getElementById('uploadLogoFile'),
    uploadUrlInput: document.getElementById('uploadLogoUrl'),
    uploadPreviewBox: document.getElementById('uploadPreviewBox'),
    btnRemoveLogo: document.getElementById('btnRemoveLogo'),

    // Endereço e Maps Preview
    inputEndereco: document.getElementById('inputEndereco'),
    btnPreviewMaps: document.getElementById('btnPreviewMaps'),
    mapsPreviewBox: document.getElementById('mapsPreviewBox'),
    mapsPreviewIframe: document.getElementById('mapsPreviewIframe'),

    // Campos Dinâmicos por Tipo
    dynamicTypeFields: document.getElementById('dynamicTypeFields'),

    // Chips de Categoria
    categoryChipsContainer: document.getElementById('categoryChipsContainer'),
    inputCategoria: document.getElementById('inputCategoria'),

    // Tabela e Filtros de Lista
    tableBody: document.getElementById('adminTableBody'),
    listFilterTabs: document.querySelectorAll('.list-filter-tab'),
    adminSearchInput: document.getElementById('adminSearchInput')
  };

  // Notificação rápida
  function alertMsg(msg, isSuccess = true) {
    alert(msg);
  }

  // Sanitizador HTML para tabela
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 1. Verificação de Autenticação Inicial
  async function checkAuth() {
    if (!state.token) {
      showLoginScreen();
      return;
    }

    try {
      const resp = await fetch('/api/admin-auth', {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.authenticated) {
          showDashboard();
          loadAdminItems();
          return;
        }
      }
      throw new Error('Sessão expirada');
    } catch (e) {
      // Se estiver em ambiente local estático sem serverless rodando, permite login com chave direta
      sessionStorage.removeItem(TOKEN_KEY);
      state.token = '';
      showLoginScreen();
    }
  }

  function showLoginScreen() {
    dom.authSection.style.display = 'flex';
    dom.adminSection.style.display = 'none';
  }

  function showDashboard() {
    dom.authSection.style.display = 'none';
    dom.adminSection.style.display = 'block';
  }

  // 2. Login Administrativo
  async function handleLogin(e) {
    e.preventDefault();
    const pass = dom.authPasswordInput.value.trim();
    if (!pass) return;

    dom.authSubmitBtn.disabled = true;
    dom.authSubmitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando Credenciais...';
    dom.authErrorNotice.style.display = 'none';

    try {
      const resp = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pass })
      });

      const data = await resp.json();
      if (resp.ok && data.success && data.token) {
        state.token = data.token;
        sessionStorage.setItem(TOKEN_KEY, data.token);
        dom.authForm.reset();
        showDashboard();
        loadAdminItems();
      } else {
        dom.authErrorNotice.textContent = data.error || 'Acesso negado. Chave mestre inválida.';
        dom.authErrorNotice.style.display = 'block';
      }
    } catch (err) {
      // Fallback para desenvolvimento local caso a API serverless não esteja ativa no momento
      if (pass === 'CSC_REDE_SOLIDARIA_2026') {
        state.token = 'DEV_LOCAL_TOKEN';
        sessionStorage.setItem(TOKEN_KEY, state.token);
        showDashboard();
        loadAdminItems();
      } else {
        dom.authErrorNotice.textContent = 'Erro de conexão com o servidor de autenticação.';
        dom.authErrorNotice.style.display = 'block';
      }
    } finally {
      dom.authSubmitBtn.disabled = false;
      dom.authSubmitBtn.innerHTML = '<i class="fas fa-lock"></i> Entrar no Painel Seguro';
    }
  }

  // 3. Logout
  function handleLogout() {
    if (confirm('Deseja realmente encerrar a sessão de administração?')) {
      sessionStorage.removeItem(TOKEN_KEY);
      state.token = '';
      showLoginScreen();
    }
  }

  // =========================================================
  // INTEGRAÇÃO COM PLANILHA GOOGLE (APPS SCRIPT)
  // =========================================================

  function updateSheetStatusUI(status, badgeText, description) {
    if (!dom.sheetConnectionPanel) return;

    dom.sheetConnectionPanel.classList.remove('is-connected', 'is-disconnected');
    dom.sheetStatusDot.classList.remove('dot-connected', 'dot-disconnected', 'dot-checking');
    dom.sheetStatusBadge.classList.remove('badge-connected', 'badge-disconnected', 'badge-checking');

    if (status === 'connected') {
      dom.sheetConnectionPanel.classList.add('is-connected');
      dom.sheetStatusDot.classList.add('dot-connected');
      dom.sheetStatusBadge.classList.add('badge-connected');
      state.isSheetConnected = true;
    } else if (status === 'disconnected') {
      dom.sheetConnectionPanel.classList.add('is-disconnected');
      dom.sheetStatusDot.classList.add('dot-disconnected');
      dom.sheetStatusBadge.classList.add('badge-disconnected');
      state.isSheetConnected = false;
    } else {
      dom.sheetStatusDot.classList.add('dot-checking');
      dom.sheetStatusBadge.classList.add('badge-checking');
    }

    if (dom.sheetStatusBadge) dom.sheetStatusBadge.textContent = badgeText;
    if (dom.sheetStatusDescription) dom.sheetStatusDescription.textContent = description;
  }

  function toggleSheetConfigDrawer() {
    if (!dom.sheetConfigDrawer) return;
    const isHidden = dom.sheetConfigDrawer.style.display === 'none' || !dom.sheetConfigDrawer.style.display;
    dom.sheetConfigDrawer.style.display = isHidden ? 'block' : 'none';
    if (isHidden && dom.inputSheetWebhookUrl) {
      dom.inputSheetWebhookUrl.value = getSheetWebhookUrl();
      dom.inputSheetWebhookUrl.focus();
    }
  }

  // Testa conexão direta com a URL do Google Apps Script
  async function testAndSaveSheetUrl() {
    if (!dom.inputSheetWebhookUrl) return;
    const url = dom.inputSheetWebhookUrl.value.trim();

    if (!url) {
      if (confirm('Deseja desvincular a URL da planilha atual? Os dados ficarão apenas no navegador local.')) {
        setSheetWebhookUrl('');
        updateSheetStatusUI('disconnected', 'Desconectada', 'Nenhuma planilha configurada. Cole a URL do Apps Script para salvar em rede.');
        alertMsg('URL da planilha removida.');
      }
      return;
    }

    if (!url.startsWith('https://script.google.com/macros/s/') || !url.endsWith('/exec')) {
      alertMsg('Aviso: A URL do Google Apps Script geralmente começa com "https://script.google.com/macros/s/" e termina em "/exec". Verifique se você copiou o link correto da implantação da aplicação Web.');
    }

    dom.btnSaveSheetUrl.disabled = true;
    dom.btnSaveSheetUrl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando Conexão...';
    updateSheetStatusUI('checking', 'Testando...', 'Conectando à planilha Google...');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch(`${url}?action=public_list`, {
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        throw new Error(`O servidor retornou erro HTTP ${resp.status}: ${resp.statusText}`);
      }

      const remoteData = await resp.json();
      if (!Array.isArray(remoteData)) {
        throw new Error('A resposta da planilha não é uma lista válida de dados.');
      }

      // Conexão bem-sucedida! Salva URL no storage e config
      setSheetWebhookUrl(url);
      state.sheetUrl = url;

      // Se houver dados remotos na planilha, atualiza o estado
      if (remoteData.length > 0) {
        state.items = remoteData;
        saveToStorage(state.items);
        renderAdminDashboard();
      } else if (state.items.length > 0) {
        // Se a planilha estiver vazia e já temos itens cadastrados localmente, sincroniza-os para a planilha
        const doSyncInitial = confirm(`Planilha conectada com sucesso! Ela está atualmente vazia.\nDeseja enviar os ${state.items.length} cadastros existentes para a planilha agora?`);
        if (doSyncInitial) {
          for (const item of state.items) {
            await syncDirectWithSheet('create', item);
          }
        }
      }

      updateSheetStatusUI('connected', 'Conectada (Rede)', `Planilha Google ativa com ${state.items.length} cadastros sincronizados em tempo real.`);
      alertMsg(`✅ Conexão estabelecida com sucesso!\nA planilha agora é o banco de dados oficial da Rede Solidária e está sincronizada em rede para todos os dispositivos e abas anônimas.`);
      
      if (dom.sheetConfigDrawer) dom.sheetConfigDrawer.style.display = 'none';

    } catch (err) {
      console.error('Erro ao testar planilha:', err);
      updateSheetStatusUI('disconnected', 'Falha no Teste', `Não foi possível conectar: ${err.message}`);
      alertMsg(`❌ Não foi possível conectar com a planilha Google:\n\n${err.message}\n\nDicas:\n1. Certifique-se de que a implantação foi feita como "App da Web" (Web app).\n2. Em "Quem pode acessar", selecione OBRIGATORIAMENTE "Qualquer pessoa" (Anyone).\n3. Verifique se a URL termina em "/exec".`);
    } finally {
      dom.btnSaveSheetUrl.disabled = false;
      dom.btnSaveSheetUrl.innerHTML = '<i class="fas fa-plug-circle-check"></i> Testar & Conectar';
    }
  }

  // Envia requisições de gravação/edição/exclusão diretamente para a planilha (fallback seguro contra bloqueios)
  async function syncDirectWithSheet(action, payload) {
    const sheetUrl = getSheetWebhookUrl();
    if (!sheetUrl) {
      return { success: false, error: 'URL da planilha não configurada.' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      
      // Enviamos com Content-Type text/plain para evitar preflight OPTIONS que o Apps Script rejeita
      const resp = await fetch(sheetUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: action,
          secretToken: CSC_API_SECRET,
          id: payload ? payload.id : undefined,
          status: payload ? payload.status : undefined,
          item: payload
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const text = await resp.text();
      let resJson = {};
      try { resJson = JSON.parse(text); } catch (e) { resJson = { raw: text }; }

      if (resp.ok && (resJson.success || !resJson.error)) {
        return { success: true, message: resJson.message || 'Gravado na planilha.' };
      }
      return { success: false, error: resJson.error || `HTTP ${resp.status}` };
    } catch (err) {
      return { success: false, error: err.name === 'AbortError' ? 'Tempo limite esgotado' : err.message };
    }
  }

  // 4. Carregar Itens da Administração
  async function loadAdminItems() {
    const localSaved = getFromStorage();
    if (localSaved !== null) {
      state.items = localSaved;
      renderAdminDashboard();
    }

    updateSheetStatusUI('checking', 'Verificando...', 'Verificando conexão com banco de dados em rede...');

    let syncedFromServer = false;

    // 1. Tenta carregar via API Serverless Segura
    try {
      const resp = await fetch('/api/admin-items', {
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success && Array.isArray(data.data)) {
          if (data.hasRemoteSheet) {
            state.items = data.data;
            saveToStorage(state.items);
            renderAdminDashboard();
            updateSheetStatusUI('connected', 'Conectada (Servidor)', `Banco de dados Google Sheets ativo via Vercel (${data.data.length} registros).`);
            syncedFromServer = true;
            return;
          } else if (data.sheetConfigured && data.sheetError) {
            updateSheetStatusUI('disconnected', 'Erro Vercel', `Planilha na Vercel falhou: ${data.sheetError}`);
          }
        }
      }
    } catch (err) {
      // API serverless indisponível ou offline
    }

    // 2. Se a API serverless não sincronizou a planilha, tenta sincronizar diretamente usando a URL da planilha
    const directUrl = getSheetWebhookUrl();
    if (directUrl && !syncedFromServer) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const sheetResp = await fetch(`${directUrl}?action=public_list`, {
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timeoutId);

        if (sheetResp.ok) {
          const sheetData = await sheetResp.json();
          if (Array.isArray(sheetData) && sheetData.length > 0) {
            state.items = sheetData;
            saveToStorage(state.items);
            renderAdminDashboard();
            updateSheetStatusUI('connected', 'Conectada (Direto)', `Conexão direta ativa com Google Sheets (${sheetData.length} registros em rede).`);
            return;
          } else if (Array.isArray(sheetData)) {
            updateSheetStatusUI('connected', 'Conectada', 'Planilha Google conectada (atualmente sem registros cadastrados).');
            return;
          }
        }
      } catch (directErr) {
        updateSheetStatusUI('disconnected', 'Erro de Acesso', `Falha ao ler da planilha: ${directErr.message}`);
      }
    } else if (!directUrl && !syncedFromServer) {
      updateSheetStatusUI('disconnected', 'Desconectada', 'Nenhuma planilha vinculada. Cadastros estão apenas neste navegador local. Configure no botão ao lado.');
    }

    // Se ainda não temos itens e nem tínhamos no storage, usa o seed inicial e persiste
    if (state.items.length === 0 && localSaved === null) {
      if (window.CSC_SEED_DATA && Array.isArray(window.CSC_SEED_DATA)) {
        state.items = [...window.CSC_SEED_DATA];
      }
      saveToStorage(state.items);
      renderAdminDashboard();
    }
  }

  // Renderiza Dashboard e Tabela
  function renderAdminDashboard() {
    updateAdminStats();
    renderTable();
  }

  // Estatísticas
  function updateAdminStats() {
    const total = state.items.length;
    const ativos = state.items.filter(i => i.status === 'ativo').length;
    const pendentes = state.items.filter(i => i.status === 'pendente').length;

    if (dom.statAdminTotal) dom.statAdminTotal.textContent = total;
    if (dom.statAdminAtivos) dom.statAdminAtivos.textContent = ativos;
    if (dom.statAdminPendentes) dom.statAdminPendentes.textContent = pendentes;
  }

  // Renderiza Tabela de Itens com Filtros
  function renderTable() {
    if (!dom.tableBody) return;

    let list = [...state.items];

    // Filtro de status da lista
    if (state.listFilter === 'ativos') {
      list = list.filter(i => i.status === 'ativo');
    } else if (state.listFilter === 'pendentes') {
      list = list.filter(i => i.status === 'pendente');
    }

    // Busca na tabela
    const search = (dom.adminSearchInput ? dom.adminSearchInput.value : '').toLowerCase().trim();
    if (search) {
      list = list.filter(item => {
        const n = (item.nome || item.titulo || '').toLowerCase();
        const c = (item.categoria || '').toLowerCase();
        const ci = (item.cidade || '').toLowerCase();
        return n.includes(search) || c.includes(search) || ci.includes(search);
      });
    }

    if (list.length === 0) {
      dom.tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
            <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
            Nenhum cadastro encontrado com os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    list.forEach(item => {
      const title = escapeHTML(item.nome || item.titulo || 'Sem nome');
      const tipo = escapeHTML(item.tipo || 'empresa');
      const categoria = escapeHTML(item.categoria || 'Geral');
      const cidade = escapeHTML(item.cidade || 'ES');
      const isAtivo = item.status === 'ativo';

      // Logo thumbnail
      let logoHTML = '';
      if (item.logoUrl) {
        logoHTML = `<div class="table-logo-cell"><img src="${escapeHTML(item.logoUrl)}" alt="${title}" onerror="this.parentElement.innerHTML='⭐'"></div>`;
      } else {
        logoHTML = `<div class="table-logo-cell" style="font-family: var(--font-heading); color: var(--primary-red-bright);">${title.charAt(0)}</div>`;
      }

      // Tipo badge
      let tipoBadge = `<span class="badge-type badge-type-${tipo}">${tipo.toUpperCase()}</span>`;

      // Status badge
      let statusBadge = isAtivo 
        ? `<span class="status-badge status-badge-active"><i class="fas fa-circle-check"></i> Ativo</span>`
        : `<span class="status-badge status-badge-pending"><i class="fas fa-clock"></i> Pendente</span>`;

      html += `
        <tr data-id="${escapeHTML(item.id)}">
          <td style="width: 60px;">${logoHTML}</td>
          <td>
            <div style="font-weight: 700; color: var(--text-white);">${title}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${cidade} • ${escapeHTML(item.bairro || '')}</div>
          </td>
          <td>${tipoBadge}</td>
          <td><span class="badge-category">${categoria}</span></td>
          <td>${statusBadge}</td>
          <td style="width: 140px; text-align: right;">
            <div class="table-actions" style="justify-content: flex-end;">
              <button class="btn-action-icon btn-action-approve" onclick="window.CSC_ADMIN.toggleStatus('${escapeHTML(item.id)}', '${isAtivo ? 'pendente' : 'ativo'}')" title="${isAtivo ? 'Ocultar da Vitrine' : 'Aprovar e Publicar'}">
                <i class="fas ${isAtivo ? 'fa-eye-slash' : 'fa-check'}"></i>
              </button>
              <button class="btn-action-icon" onclick="window.CSC_ADMIN.editItem('${escapeHTML(item.id)}')" title="Editar Cadastro">
                <i class="fas fa-pen-to-square"></i>
              </button>
              <button class="btn-action-icon btn-action-delete" onclick="window.CSC_ADMIN.deleteItem('${escapeHTML(item.id)}')" title="Excluir Permanentemente">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    dom.tableBody.innerHTML = html;
  }

  // 5. Troca de Tipo de Cadastro no Formulário
  function setFormType(tipo) {
    state.currentFormType = tipo;
    dom.formTypeTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-type') === tipo);
    });

    renderDynamicFormFields(tipo);
    renderCategoryChips(tipo);
  }

  // Renderiza Campos Específicos por Tipo
  function renderDynamicFormFields(tipo, data = {}) {
    if (!dom.dynamicTypeFields) return;

    let html = '';
    if (tipo === 'empresa') {
      html = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="inputRazaoSocial">Razão Social ou Slogan</label>
            <input type="text" name="razaoSocial" id="inputRazaoSocial" class="form-input" value="${escapeHTML(data.razaoSocial || '')}" placeholder="Ex: Café & Livraria Resistência Ltda">
          </div>
          <div class="form-group">
            <label class="form-label" for="inputHorario">Horário de Funcionamento</label>
            <input type="text" name="horario" id="inputHorario" class="form-input" value="${escapeHTML(data.horario || '')}" placeholder="Ex: Ter a Sáb das 14h às 21h">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="inputBeneficio">Benefício Exclusivo para Camaradas / Militância</label>
          <input type="text" name="beneficio" id="inputBeneficio" class="form-input" value="${escapeHTML(data.beneficio || '')}" placeholder="Ex: 10% de desconto em todo o cardápio ou brinde aos camaradas">
        </div>
      `;
    } else if (tipo === 'autonomo') {
      html = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="inputProfissao">Profissão / Ocupação <span>*</span></label>
            <input type="text" name="profissao" id="inputProfissao" required class="form-input" value="${escapeHTML(data.profissao || '')}" placeholder="Ex: Advogada Trabalhista, Eletricista, Psicólogo">
          </div>
          <div class="form-group">
            <label class="form-label" for="inputModalidade">Modalidade de Atendimento</label>
            <select name="modalidade" id="inputModalidade" class="form-select">
              <option value="Presencial e Remoto" ${data.modalidade === 'Presencial e Remoto' ? 'selected' : ''}>Presencial e Remoto</option>
              <option value="Atendimento a Domicílio" ${data.modalidade === 'Atendimento a Domicílio' ? 'selected' : ''}>Atendimento a Domicílio</option>
              <option value="100% Remoto / Online" ${data.modalidade === '100% Remoto / Online' ? 'selected' : ''}>100% Remoto / Online</option>
              <option value="No Consultório / Ateliê" ${data.modalidade === 'No Consultório / Ateliê' ? 'selected' : ''}>No Consultório / Ateliê</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="inputPortfolio">Link do Portfólio / LinkedIn / Site</label>
          <input type="url" name="portfolio" id="inputPortfolio" class="form-input" value="${escapeHTML(data.portfolio || '')}" placeholder="https://linkedin.com/in/usuario">
        </div>
      `;
    } else if (tipo === 'vaga') {
      html = `
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="inputEmpresaNome">Empresa ou Projeto Contratante <span>*</span></label>
            <input type="text" name="empresaNome" id="inputEmpresaNome" required class="form-input" value="${escapeHTML(data.empresaNome || '')}" placeholder="Ex: Armazém Terra Livre">
          </div>
          <div class="form-group">
            <label class="form-label" for="inputTipoContrato">Tipo de Contrato</label>
            <select name="tipoContrato" id="inputTipoContrato" class="form-select">
              <option value="CLT" ${data.tipoContrato === 'CLT' ? 'selected' : ''}>CLT Efetivo</option>
              <option value="PJ" ${data.tipoContrato === 'PJ' ? 'selected' : ''}>PJ / Prestador</option>
              <option value="Estágio" ${data.tipoContrato === 'Estágio' ? 'selected' : ''}>Estágio</option>
              <option value="Temporário / Freelance" ${data.tipoContrato === 'Temporário / Freelance' ? 'selected' : ''}>Temporário / Freelance</option>
            </select>
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" for="inputSalario">Salário / Remuneração + Benefícios</label>
            <input type="text" name="salario" id="inputSalario" class="form-input" value="${escapeHTML(data.salario || '')}" placeholder="Ex: R$ 2.400,00 + Vale Transporte + Alimentação">
          </div>
          <div class="form-group">
            <label class="form-label" for="inputPrazo">Prazo de Seleção</label>
            <input type="text" name="prazo" id="inputPrazo" class="form-input" value="${escapeHTML(data.prazo || '')}" placeholder="Ex: Início Imediato / Até 30/11">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="inputEmailCandidatura">E-mail para Recebimento de Currículos (Sigiloso)</label>
          <input type="email" name="emailCandidatura" id="inputEmailCandidatura" class="form-input" value="${escapeHTML(data.emailCandidatura || '')}" placeholder="vagas@coletivocapixaba.org">
        </div>
      `;
    }

    dom.dynamicTypeFields.innerHTML = html;
  }

  // Chips de Categorias Sugeridas
  function renderCategoryChips(tipo) {
    if (!dom.categoryChipsContainer) return;

    let suggestions = [];
    if (tipo === 'empresa') {
      suggestions = ['Gastronomia & Cafés', 'Livrarias & Cultura', 'Vestuário & Moda', 'Mercado & Agroecologia', 'Serviços Automotivos', 'Artesanato', 'Design & Gráfica', 'Eventos'];
    } else if (tipo === 'autonomo') {
      suggestions = ['Assessoria Jurídica', 'Saúde & Bem-Estar', 'Serviços Manuais & Reformas', 'Educação & Aulas', 'Tecnologia & Criação', 'Beleza & Estética', 'Fotografia & Vídeo'];
    } else if (tipo === 'vaga') {
      suggestions = ['Gastronomia & Hospitalidade', 'Tecnologia & TI', 'Administração & Logística', 'Vendas & Atendimento', 'Educação', 'Operacional'];
    }

    let html = '';
    suggestions.forEach(cat => {
      html += `<span class="cat-chip" onclick="document.getElementById('inputCategoria').value='${cat}'">${cat}</span>`;
    });
    dom.categoryChipsContainer.innerHTML = html;
  }

  // 6. Upload e Compressão Automática de Logo / Imagem via Canvas
  function handleImageUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
      alertMsg('Selecione um arquivo de imagem válido (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Redimensiona no Canvas para no máximo 220x220 px (perfeito para cards e cabe no Sheets com segurança)
        const canvas = document.createElement('canvas');
        const maxDimension = 220;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          }
        } else {
          if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para WebP com qualidade 0.72 (tamanho de 3KB a 8KB)
        const compressedBase64 = canvas.toDataURL('image/webp', 0.72);
        setLogoPreview(compressedBase64);
        state.currentLogoBase64 = compressedBase64;
        dom.uploadUrlInput.value = '';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setLogoPreview(src) {
    if (src) {
      dom.uploadPreviewBox.innerHTML = `<img src="${src}" class="upload-preview-img" alt="Logo preview">`;
      dom.btnRemoveLogo.style.display = 'inline-flex';
    } else {
      dom.uploadPreviewBox.innerHTML = `<div class="upload-preview-empty"><i class="fas fa-image"></i></div>`;
      dom.btnRemoveLogo.style.display = 'none';
      state.currentLogoBase64 = '';
    }
  }

  // 7. Preview do Google Maps no Formulário
  function previewAddressOnMaps() {
    const end = dom.inputEndereco.value.trim();
    if (!end) {
      alertMsg('Digite um endereço ou cidade para pré-visualizar no Google Maps.');
      return;
    }
    const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(end)}&output=embed`;
    dom.mapsPreviewIframe.src = embedUrl;
    dom.mapsPreviewBox.classList.add('active');
  }

  // 8. Salvar Cadastro (Novo ou Edição)
  async function handleSubmitItem(e) {
    e.preventDefault();
    const formData = new FormData(dom.itemForm);
    const payload = Object.fromEntries(formData.entries());

    payload.tipo = state.currentFormType;
    payload.logoUrl = state.currentLogoBase64 || dom.uploadUrlInput.value.trim();

    if (!payload.nome) {
      alertMsg('Informe o nome ou título do cadastro.');
      return;
    }

    dom.submitFormBtn.disabled = true;
    dom.submitFormBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando na Rede Solidária...';

    const isEdit = Boolean(state.editingItemId);
    const method = isEdit ? 'PUT' : 'POST';
    if (isEdit) {
      payload.id = state.editingItemId;
    } else {
      payload.id = `${state.currentFormType}-${Date.now()}`;
      if (!payload.status) payload.status = 'ativo';
      if (!payload.dataCadastro) payload.dataCadastro = new Date().toISOString();
    }

    let savedToCloud = false;

    // 1. Tenta salvar via API Serverless
    try {
      const resp = await fetch('/api/admin-items', {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify(payload)
      });

      const resData = await resp.json().catch(() => ({}));
      if (resp.ok && resData.success && resData.sheetSynced) {
        savedToCloud = true;
      }
    } catch (err) {
      // API serverless falhou ou offline
    }

    // 2. Se o servidor Vercel não confirmou gravação na planilha, tenta sincronização direta com a Planilha Google
    if (!savedToCloud) {
      const directSync = await syncDirectWithSheet(isEdit ? 'update' : 'create', payload);
      if (directSync.success) {
        savedToCloud = true;
      }
    }

    // 3. Atualiza estado e storage local
    if (isEdit) {
      const idx = state.items.findIndex(i => i.id === state.editingItemId);
      if (idx !== -1) {
        state.items[idx] = { ...state.items[idx], ...payload };
      }
    } else {
      state.items.unshift(payload);
    }
    saveToStorage(state.items);
    closeForm();
    renderAdminDashboard();

    dom.submitFormBtn.disabled = false;
    dom.submitFormBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Publicar / Salvar Cadastro';

    if (savedToCloud) {
      alertMsg(`✅ SUCESSO!\n${isEdit ? 'Cadastro atualizado' : 'Novo cadastro publicado'} e gravado na Planilha Google com sucesso!\nO registro agora está disponível em rede para todos os celulares e abas anônimas.`);
    } else {
      alertMsg(`⚠️ ATENÇÃO: O cadastro foi salvo APENAS NESTE NAVEGADOR!\nNão foi possível salvar na rede Google Sheets porque nenhuma planilha está conectada ou o link falhou.\n\nPara que os dados fiquem salvos em rede e não sumam em aba anônima, clique em "Configurar URL" no topo da página e conecte sua planilha.`);
    }
  }

  // Controles de Abertura e Fechamento do Formulário (Colapsável)
  function openForm(isEdit = false) {
    if (!dom.formCard) return;
    dom.formCard.style.display = 'block';
    if (dom.btnToggleNovoCadastro) {
      dom.btnToggleNovoCadastro.innerHTML = isEdit 
        ? '<i class="fas fa-xmark"></i> Fechar Edição' 
        : '<i class="fas fa-xmark"></i> Fechar Formulário';
      dom.btnToggleNovoCadastro.classList.remove('btn-primary');
      dom.btnToggleNovoCadastro.classList.add('btn-secondary');
    }
  }

  function closeForm() {
    if (!dom.formCard) return;
    dom.formCard.style.display = 'none';
    if (dom.btnToggleNovoCadastro) {
      dom.btnToggleNovoCadastro.innerHTML = '<i class="fas fa-plus-circle"></i> Novo Cadastro';
      dom.btnToggleNovoCadastro.classList.remove('btn-secondary');
      dom.btnToggleNovoCadastro.classList.add('btn-primary');
    }
    state.editingItemId = null;
    dom.itemForm.reset();
    setLogoPreview('');
    dom.mapsPreviewBox.classList.remove('active');
    dom.mapsPreviewIframe.src = 'about:blank';
    dom.formCard.classList.remove('editing');
  }

  function toggleNovoCadastro() {
    if (dom.formCard.style.display === 'none' || !dom.formCard.style.display) {
      resetFormToNew();
      openForm(false);
      dom.formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      closeForm();
    }
  }

  // Edita item existente
  function editItem(id) {
    const item = state.items.find(i => i.id === id);
    if (!item) return;

    state.editingItemId = id;
    setFormType(item.tipo || 'empresa');

    // Preenche campos base
    document.getElementById('inputNome').value = item.nome || item.titulo || '';
    document.getElementById('inputCategoria').value = item.categoria || '';
    document.getElementById('inputCidade').value = item.cidade || 'Vitória';
    document.getElementById('inputBairro').value = item.bairro || '';
    document.getElementById('inputEndereco').value = item.endereco || '';
    document.getElementById('inputWhatsapp').value = item.whatsapp || '';
    document.getElementById('inputInstagram').value = item.instagram || '';
    document.getElementById('inputSite').value = item.site || '';
    document.getElementById('inputDescricao').value = item.descricao || '';
    document.getElementById('selectStatus').value = item.status || 'ativo';

    // Logo
    if (item.logoUrl) {
      setLogoPreview(item.logoUrl);
      if (item.logoUrl.startsWith('data:image')) {
        state.currentLogoBase64 = item.logoUrl;
        dom.uploadUrlInput.value = '';
      } else {
        state.currentLogoBase64 = '';
        dom.uploadUrlInput.value = item.logoUrl;
      }
    } else {
      setLogoPreview('');
    }

    // Campos dinâmicos
    renderDynamicFormFields(item.tipo, item);

    // Ajusta UI do card de formulário e abre
    openForm(true);
    dom.formCard.classList.add('editing');
    dom.formTitle.innerHTML = `<i class="fas fa-pen-to-square" style="color: #f59e0b;"></i> EDITANDO: <span>${escapeHTML(item.nome || item.titulo)}</span>`;
    dom.formSubtitle.textContent = 'Altere as informações abaixo e clique em Salvar Alterações.';
    dom.cancelEditBtn.style.display = 'inline-flex';
    dom.submitFormBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar Alterações';

    // Rola até o formulário
    dom.formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Se tiver endereço, já exibe no maps preview
    if (item.endereco) {
      previewAddressOnMaps();
    }
  }

  // Reseta formulário para modo "Novo Cadastro"
  function resetFormToNew() {
    state.editingItemId = null;
    dom.itemForm.reset();
    setLogoPreview('');
    dom.mapsPreviewBox.classList.remove('active');
    dom.mapsPreviewIframe.src = 'about:blank';
    dom.formCard.classList.remove('editing');
    dom.formTitle.innerHTML = `<i class="fas fa-plus-circle" style="color: var(--primary-red-bright);"></i> NOVO <span>CADASTRO</span>`;
    dom.formSubtitle.textContent = 'Adicione uma nova empresa, autônomo ou vaga de emprego na Rede Solidária.';
    dom.cancelEditBtn.style.display = 'none';
    dom.submitFormBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Publicar / Salvar Cadastro';
    setFormType(state.currentFormType);
  }

  // Alterna status (Ativo / Pendente)
  async function toggleStatus(id, newStatus) {
    const item = state.items.find(i => i.id === id);
    if (item) {
      item.status = newStatus;
      saveToStorage(state.items);
      renderAdminDashboard();
    }

    // 1. Tenta API serverless
    try {
      await fetch('/api/admin-items', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.token}`
        },
        body: JSON.stringify({ id, status: newStatus })
      });
    } catch (e) {
      // offline
    }

    // 2. Sincroniza diretamente na planilha Google
    await syncDirectWithSheet('toggle_status', { id, status: newStatus });
  }

  // Exclui item permanentemente
  async function deleteItem(id) {
    const item = state.items.find(i => i.id === id);
    const nome = item ? (item.nome || item.titulo) : 'este registro';

    if (!confirm(`Tem certeza absoluta de que deseja EXCLUIR PERMANENTEMENTE "${nome}" da Rede Solidária e da Planilha Google?`)) {
      return;
    }

    state.items = state.items.filter(i => i.id !== id);
    saveToStorage(state.items);
    renderAdminDashboard();

    // 1. Tenta API serverless
    try {
      await fetch(`/api/admin-items?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
    } catch (e) {
      // offline
    }

    // 2. Sincroniza diretamente na planilha Google
    await syncDirectWithSheet('delete', { id });
    alertMsg('Registro excluído permanentemente da Rede Solidária e da Planilha.');
  }

  // Conecta eventos do painel
  function bindEvents() {
    // Login
    if (dom.authForm) dom.authForm.addEventListener('submit', handleLogin);

    // Logout
    if (dom.adminLogoutBtn) dom.adminLogoutBtn.addEventListener('click', handleLogout);

    // Atualizar Lista
    if (dom.refreshListBtn) dom.refreshListBtn.addEventListener('click', loadAdminItems);

    // Painel de Configuração da Planilha Google
    if (dom.btnToggleSheetConfig) dom.btnToggleSheetConfig.addEventListener('click', toggleSheetConfigDrawer);
    if (dom.btnSaveSheetUrl) dom.btnSaveSheetUrl.addEventListener('click', testAndSaveSheetUrl);
    if (dom.btnForceSyncSheet) dom.btnForceSyncSheet.addEventListener('click', loadAdminItems);

    // Abas de tipo de formulário
    dom.formTypeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        setFormType(tab.getAttribute('data-type'));
      });
    });

    // Upload de Imagem por arquivo
    if (dom.uploadInput) {
      dom.uploadInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleImageUpload(e.target.files[0]);
        }
      });
    }

    // Upload por URL
    if (dom.uploadUrlInput) {
      dom.uploadUrlInput.addEventListener('input', (e) => {
        const url = e.target.value.trim();
        if (url) {
          state.currentLogoBase64 = '';
          setLogoPreview(url);
        }
      });
    }

    // Remover logo
    if (dom.btnRemoveLogo) {
      dom.btnRemoveLogo.addEventListener('click', () => {
        setLogoPreview('');
        if (dom.uploadInput) dom.uploadInput.value = '';
        if (dom.uploadUrlInput) dom.uploadUrlInput.value = '';
      });
    }

    // Botão Maps Preview
    if (dom.btnPreviewMaps) {
      dom.btnPreviewMaps.addEventListener('click', previewAddressOnMaps);
    }
    if (dom.inputEndereco) {
      dom.inputEndereco.addEventListener('blur', () => {
        if (dom.inputEndereco.value.trim() && !dom.mapsPreviewBox.classList.contains('active')) {
          previewAddressOnMaps();
        }
      });
    }

    // Alternar / Fechar Formulário (Colapsável)
    if (dom.btnToggleNovoCadastro) dom.btnToggleNovoCadastro.addEventListener('click', toggleNovoCadastro);
    if (dom.btnCloseForm) dom.btnCloseForm.addEventListener('click', closeForm);
    if (dom.cancelEditBtn) dom.cancelEditBtn.addEventListener('click', closeForm);

    // Submissão do Formulário
    if (dom.itemForm) dom.itemForm.addEventListener('submit', handleSubmitItem);

    // Filtros da Tabela
    dom.listFilterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        dom.listFilterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.listFilter = tab.getAttribute('data-filter');
        renderTable();
      });
    });

    // Busca na tabela
    if (dom.adminSearchInput) {
      dom.adminSearchInput.addEventListener('input', renderTable);
    }
  }

  // Exporta métodos globais para callbacks de cliques da tabela
  window.CSC_ADMIN = {
    editItem,
    toggleStatus,
    deleteItem
  };

  // Inicializa
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    setFormType('empresa');
    checkAuth();
  });

})();
