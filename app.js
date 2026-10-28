/**
 * REDE SOLIDÁRIA - COLETIVO SOCIALISTA CAPIXABA
 * Lógica do Catálogo Público & Modais Interativos
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'CSC_REDE_SOLIDARIA_DATA_V1';

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

  function saveToStorage(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {}
  }

  // Estado global da aplicação cliente
  const state = {
    items: [],
    filteredItems: [],
    currentType: 'todos',
    currentCategory: 'todas',
    currentCity: 'todas',
    searchQuery: '',
    searchDebounceTimer: null
  };

  // Elementos do DOM
  const dom = {
    cardsGrid: document.getElementById('cardsGrid'),
    resultsCount: document.getElementById('resultsCount'),
    typeTabs: document.querySelectorAll('.type-tab'),
    citySelect: document.getElementById('citySelect'),
    categorySelect: document.getElementById('categorySelect'),
    searchInput: document.getElementById('searchInput'),
    searchClear: document.getElementById('searchClear'),
    resetFilterBtn: document.getElementById('resetFilterBtn'),
    
    // Stats
    statEmpresas: document.getElementById('statEmpresas'),
    statAutonomos: document.getElementById('statAutonomos'),
    statVagas: document.getElementById('statVagas'),
    
    // Maps Modal
    mapsModal: document.getElementById('mapsModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalAddress: document.getElementById('modalAddress'),
    modalMapIframe: document.getElementById('modalMapIframe'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalRouteBtn: document.getElementById('modalRouteBtn'),
    modalWazeBtn: document.getElementById('modalWazeBtn'),
    modalCopyAddressBtn: document.getElementById('modalCopyAddressBtn'),

    // Suggest Modal
    suggestModal: document.getElementById('suggestModal'),
    openSuggestBtn: document.getElementById('openSuggestBtn'),
    heroSuggestBtn: document.getElementById('heroSuggestBtn'),
    suggestCloseBtn: document.getElementById('suggestCloseBtn'),
    suggestForm: document.getElementById('suggestForm'),
    suggestTipoSelect: document.getElementById('suggestTipo'),
    suggestExtraFields: document.getElementById('suggestExtraFields'),

    // Toast
    toast: document.getElementById('toastMsg'),
    toastText: document.getElementById('toastText')
  };

  // Sanitizador anti-XSS para renderização segura
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Notificação Toast
  function showToast(message, duration = 3500) {
    if (!dom.toast) return;
    dom.toastText.textContent = message;
    dom.toast.classList.add('show');
    setTimeout(() => {
      dom.toast.classList.remove('show');
    }, duration);
  }

  // Carregamento de Itens via Storage, API, Google Apps Script Direto ou Seed Data
  async function loadItems() {
    const localItems = getFromStorage();
    if (localItems !== null) {
      state.items = localItems.filter(i => i.status === 'ativo');
      initApp();
    }

    let remoteSynced = false;

    // 1. Tenta carregar via API Serverless Segura
    try {
      const resp = await fetch('/api/items');
      if (resp.ok) {
        const json = await resp.json();
        if (json.success && Array.isArray(json.data)) {
          if (json.hasRemoteSheet) {
            state.items = json.data.filter(i => i.status === 'ativo');
            saveToStorage(json.data);
            initApp();
            remoteSynced = true;
            return;
          } else if (localItems === null && json.data.length > 0) {
            state.items = json.data.filter(i => i.status === 'ativo');
            initApp();
          }
        }
      }
    } catch (e) {
      // offline / fallback
    }

    // 2. Se a API do servidor não retornou a planilha remota, consulta a Planilha Google diretamente em rede
    const sheetUrl = (window.CSC_CONFIG && window.CSC_CONFIG.googleSheetWebhookUrl) || localStorage.getItem('CSC_SHEET_WEBHOOK_URL') || '';
    if (!remoteSynced && sheetUrl && sheetUrl.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        const resp = await fetch(`${sheetUrl}?action=public_list`, {
          signal: controller.signal,
          redirect: 'follow'
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const remoteItems = await resp.json();
          if (Array.isArray(remoteItems)) {
            state.items = remoteItems.filter(i => i.status === 'ativo');
            saveToStorage(remoteItems);
            initApp();
            remoteSynced = true;
            return;
          }
        }
      } catch (errDirect) {
        console.warn('Google Sheets direto indisponível:', errDirect.message);
      }
    }

    // 3. Fallback final para seed data apenas se não houver nada local nem remoto
    if (!remoteSynced && localItems === null && state.items.length === 0) {
      if (window.CSC_SEED_DATA && Array.isArray(window.CSC_SEED_DATA)) {
        state.items = window.CSC_SEED_DATA.filter(i => i.status === 'ativo');
        saveToStorage(window.CSC_SEED_DATA);
      } else {
        state.items = [];
      }
      initApp();
    }
  }

  let eventsBound = false;

  // Inicialização após carga de dados
  function initApp() {
    updateStatistics();
    populateCategoryFilter();
    applyFilters();
    if (!eventsBound) {
      bindEvents();
      eventsBound = true;
    }
  }

  // Atualiza contadores do Hero
  function updateStatistics() {
    const empresasCount = state.items.filter(i => i.tipo === 'empresa').length;
    const autonomosCount = state.items.filter(i => i.tipo === 'autonomo').length;
    const vagasCount = state.items.filter(i => i.tipo === 'vaga').length;

    if (dom.statEmpresas) dom.statEmpresas.textContent = empresasCount;
    if (dom.statAutonomos) dom.statAutonomos.textContent = autonomosCount;
    if (dom.statVagas) dom.statVagas.textContent = vagasCount;

    // Atualiza contadores nas tabs
    document.querySelectorAll('[data-tab-count]').forEach(el => {
      const tabType = el.getAttribute('data-tab-count');
      if (tabType === 'todos') el.textContent = state.items.length;
      if (tabType === 'empresa') el.textContent = empresasCount;
      if (tabType === 'autonomo') el.textContent = autonomosCount;
      if (tabType === 'vaga') el.textContent = vagasCount;
    });
  }

  // Popula o select de categorias com valores dinâmicos dos itens
  function populateCategoryFilter() {
    if (!dom.categorySelect) return;
    const categories = new Set();

    state.items.forEach(item => {
      if (item.categoria && item.categoria.trim()) {
        categories.add(item.categoria.trim());
      }
    });

    // Mantém a primeira opção "Todas as Categorias"
    dom.categorySelect.innerHTML = '<option value="todas">Todas as Categorias</option>';
    
    Array.from(categories).sort().forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      dom.categorySelect.appendChild(opt);
    });
  }

  // Aplica filtros de Tipo, Categoria, Cidade e Busca
  function applyFilters() {
    let list = [...state.items];

    // Filtro por tipo
    if (state.currentType !== 'todos') {
      list = list.filter(i => i.tipo === state.currentType);
    }

    // Filtro por categoria
    if (state.currentCategory !== 'todas') {
      list = list.filter(i => i.categoria && i.categoria.toLowerCase() === state.currentCategory.toLowerCase());
    }

    // Filtro por cidade
    if (state.currentCity !== 'todas') {
      list = list.filter(i => i.cidade && i.cidade.toLowerCase().includes(state.currentCity.toLowerCase()));
    }

    // Filtro de busca textual
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase();
      list = list.filter(item => {
        const nome = (item.nome || item.titulo || '').toLowerCase();
        const desc = (item.descricao || '').toLowerCase();
        const prof = (item.profissao || item.empresaNome || '').toLowerCase();
        const cat = (item.categoria || '').toLowerCase();
        const end = (item.endereco || item.bairro || '').toLowerCase();
        const ben = (item.beneficio || item.salario || '').toLowerCase();
        return nome.includes(query) || desc.includes(query) || prof.includes(query) || 
               cat.includes(query) || end.includes(query) || ben.includes(query);
      });
    }

    state.filteredItems = list;
    renderCards(list);
  }

  // Renderiza a lista de cards
  function renderCards(items) {
    if (!dom.cardsGrid) return;

    if (dom.resultsCount) {
      dom.resultsCount.innerHTML = `Exibindo <strong>${items.length}</strong> iniciativa${items.length === 1 ? '' : 's'}`;
    }

    if (items.length === 0) {
      dom.cardsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fas fa-search"></i></div>
          <h3 class="empty-title">Nenhum resultado encontrado</h3>
          <p class="empty-desc">Tente ajustar os filtros, buscar por outro termo ou selecione outra cidade capixaba.</p>
          <button class="btn btn-secondary btn-sm" id="btnResetFiltersEmpty">
            <i class="fas fa-rotate-left"></i> Limpar Filtros
          </button>
        </div>
      `;
      const btnReset = document.getElementById('btnResetFiltersEmpty');
      if (btnReset) {
        btnReset.addEventListener('click', resetFilters);
      }
      return;
    }

    let html = '';
    items.forEach(item => {
      html += renderItemCard(item);
    });

    dom.cardsGrid.innerHTML = html;

    // Conecta botões "Ver no Maps" gerados dinamicamente
    dom.cardsGrid.querySelectorAll('.btn-open-maps').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const query = btn.getAttribute('data-maps-query');
        const name = btn.getAttribute('data-name');
        const address = btn.getAttribute('data-address');
        openMapsModal(query, name, address);
      });
    });
  }

  // Gera o HTML individual do card
  function renderItemCard(item) {
    const isEmpresa = item.tipo === 'empresa';
    const isAutonomo = item.tipo === 'autonomo';
    const isVaga = item.tipo === 'vaga';

    const title = escapeHTML(item.nome || item.titulo || 'Sem título');
    const subtitle = escapeHTML(item.razaoSocial || item.profissao || item.empresaNome || '');
    const category = escapeHTML(item.categoria || 'Geral');
    const city = escapeHTML(item.cidade || 'ES');
    const address = escapeHTML(item.endereco || `${item.bairro ? item.bairro + ', ' : ''}${city}`);
    const mapsQuery = escapeHTML(item.mapsQuery || item.endereco || `${title}, ${city}`);
    const desc = escapeHTML(item.descricao || '');
    const beneficio = escapeHTML(item.beneficio || '');
    const salario = escapeHTML(item.salario || '');
    const modalidade = escapeHTML(item.modalidade || (isVaga ? item.tipoContrato : ''));

    // Logo / Foto
    let logoHTML = '';
    if (item.logoUrl) {
      logoHTML = `<img src="${escapeHTML(item.logoUrl)}" alt="${title}" class="item-logo-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'item-logo-fallback\\'>${title.charAt(0)}</div>'">`;
    } else {
      logoHTML = `<div class="item-logo-fallback">${title.charAt(0)}</div>`;
    }

    // Tipo Badge
    let typeBadge = '';
    if (isEmpresa) {
      typeBadge = `<span class="badge-type badge-type-empresa"><i class="fas fa-store"></i> Empresa</span>`;
    } else if (isAutonomo) {
      typeBadge = `<span class="badge-type badge-type-autonomo"><i class="fas fa-user-tie"></i> Autônomo</span>`;
    } else if (isVaga) {
      typeBadge = `<span class="badge-type badge-type-vaga"><i class="fas fa-briefcase"></i> Vaga</span>`;
    }

    // Bloco de destaque (Benefício para militância OU Salário da vaga)
    let highlightBox = '';
    if (isEmpresa && beneficio) {
      highlightBox = `
        <div class="solidarity-badge-box">
          <i class="fas fa-star"></i>
          <div><strong>Apoio Militante:</strong> ${beneficio}</div>
        </div>
      `;
    } else if (isVaga && salario) {
      highlightBox = `
        <div class="salary-badge-box">
          <i class="fas fa-hand-holding-dollar"></i>
          <div>${salario}</div>
        </div>
      `;
    } else if (isAutonomo && modalidade) {
      highlightBox = `
        <div class="solidarity-badge-box">
          <i class="fas fa-handshake-angle"></i>
          <div><strong>Modalidade:</strong> ${modalidade} • Apoio mútuo aos trabalhadores.</div>
        </div>
      `;
    }

    // Botões de contato
    let actionButtons = '';
    if (item.whatsapp) {
      const cleanWa = item.whatsapp.replace(/\D/g, '');
      const waMsg = encodeURIComponent(`Olá! Encontrei seu cadastro na Rede Solidária do Coletivo Socialista Capixaba e gostaria de saber mais.`);
      actionButtons += `
        <a href="https://wa.me/55${cleanWa}?text=${waMsg}" target="_blank" rel="noopener noreferrer" class="item-action-btn btn-whatsapp" title="Falar no WhatsApp">
          <i class="fab fa-whatsapp"></i> ${isVaga ? 'Candidatar-se' : 'WhatsApp'}
        </a>
      `;
    }

    if (item.instagram) {
      const cleanInsta = item.instagram.replace(/^@/, '');
      actionButtons += `
        <a href="https://instagram.com/${cleanInsta}" target="_blank" rel="noopener noreferrer" class="item-action-btn btn-instagram" title="Instagram: @${cleanInsta}">
          <i class="fab fa-instagram"></i> Instagram
        </a>
      `;
    }

    if (item.site || item.portfolio) {
      const url = item.site || item.portfolio;
      actionButtons += `
        <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" class="item-action-btn btn-web" title="Site / Portfólio">
          <i class="fas fa-arrow-up-right-from-square"></i> Web
        </a>
      `;
    }

    if (isVaga && item.emailCandidatura && !item.whatsapp) {
      actionButtons += `
        <a href="mailto:${escapeHTML(item.emailCandidatura)}?subject=${encodeURIComponent('Candidatura: ' + (item.titulo || 'Vaga'))}" class="item-action-btn btn-primary" title="Enviar Currículo">
          <i class="fas fa-envelope"></i> Enviar Currículo
        </a>
      `;
    }

    return `
      <article class="item-card" data-id="${escapeHTML(item.id)}">
        <div class="item-card-header">
          <div class="item-logo-wrap">
            ${logoHTML}
          </div>
          <div class="item-meta">
            <div class="item-badge-row">
              ${typeBadge}
              <span class="badge-category">${category}</span>
            </div>
            <h3 class="item-name" title="${title}">${title}</h3>
            ${subtitle ? `<p class="item-subname" title="${subtitle}">${subtitle}</p>` : ''}
          </div>
        </div>

        <div class="item-card-body">
          <div class="item-location-box">
            <div class="location-text">
              <i class="fas fa-location-dot"></i>
              <span>${address}</span>
            </div>
            <button class="btn-open-maps" data-maps-query="${mapsQuery}" data-name="${title}" data-address="${address}" title="Ver endereço no Google Maps">
              <i class="fas fa-map-location-dot"></i> Maps
            </button>
          </div>

          <p class="item-desc">${desc}</p>

          ${highlightBox}

          ${actionButtons ? `<div class="item-card-actions">${actionButtons}</div>` : ''}
        </div>
      </article>
    `;
  }

  // Abre Modal do Google Maps
  function openMapsModal(query, name, address) {
    if (!dom.mapsModal) return;

    dom.modalTitle.textContent = name || 'Localização';
    dom.modalSubtitle.textContent = address || 'Endereço cadastrado';
    dom.modalAddress.textContent = address || '';

    // URL responsiva oficial de embed do Google Maps (sem necessitar de chave paga exposta)
    const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
    dom.modalMapIframe.src = embedUrl;

    // Botões externos de navegação
    dom.modalRouteBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    dom.modalWazeBtn.href = `https://waze.com/ul?q=${encodeURIComponent(query)}`;

    // Ação de copiar endereço
    dom.modalCopyAddressBtn.onclick = () => {
      navigator.clipboard.writeText(address).then(() => {
        showToast('Endereço copiado para a área de transferência!');
      });
    };

    dom.mapsModal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  // Fecha Modal do Google Maps
  function closeMapsModal() {
    if (!dom.mapsModal) return;
    dom.mapsModal.classList.remove('active');
    dom.modalMapIframe.src = 'about:blank';
    document.body.style.overflow = '';
  }

  // Abre Modal de Indicação / Sugestão Pública
  function openSuggestModal() {
    if (!dom.suggestModal) return;
    dom.suggestModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateSuggestFields();
  }

  // Fecha Modal de Indicação
  function closeSuggestModal() {
    if (!dom.suggestModal) return;
    dom.suggestModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Ajusta campos extras no modal de indicação conforme o tipo selecionado
  function updateSuggestFields() {
    if (!dom.suggestTipoSelect || !dom.suggestExtraFields) return;
    const tipo = dom.suggestTipoSelect.value;

    let html = '';
    if (tipo === 'empresa') {
      html = `
        <div class="form-group">
          <label class="form-label">Benefício para a Militância / Companheiros</label>
          <input type="text" name="beneficio" class="form-input" placeholder="Ex: 10% de desconto ou brinde para camaradas">
        </div>
        <div class="form-group">
          <label class="form-label">Horário de Funcionamento</label>
          <input type="text" name="horario" class="form-input" placeholder="Ex: Seg a Sex das 09h às 18h">
        </div>
      `;
    } else if (tipo === 'autonomo') {
      html = `
        <div class="form-group">
          <label class="form-label">Profissão / Ocupação <span>*</span></label>
          <input type="text" name="profissao" required class="form-input" placeholder="Ex: Eletricista, Psicóloga, Advogado, Designer">
        </div>
        <div class="form-group">
          <label class="form-label">Modalidade de Atendimento</label>
          <select name="modalidade" class="form-select">
            <option value="Presencial e Remoto">Presencial e Remoto</option>
            <option value="Atendimento a Domicílio">Atendimento a Domicílio</option>
            <option value="100% Remoto / Online">100% Remoto / Online</option>
            <option value="Apenas no Consultório/Oficina">Apenas no Consultório/Oficina</option>
          </select>
        </div>
      `;
    } else if (tipo === 'vaga') {
      html = `
        <div class="form-group">
          <label class="form-label">Nome da Empresa ou Projeto Contratante <span>*</span></label>
          <input type="text" name="empresaNome" required class="form-input" placeholder="Ex: Restaurante Raízes">
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Tipo de Contrato</label>
            <select name="tipoContrato" class="form-select">
              <option value="CLT">CLT Efetivo</option>
              <option value="PJ">PJ / Prestador</option>
              <option value="Estágio">Estágio</option>
              <option value="Temporário / Freelance">Temporário / Freelance</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Salário / Remuneração</label>
            <input type="text" name="salario" class="form-input" placeholder="Ex: R$ 2.200,00 + Benefícios">
          </div>
        </div>
      `;
    }

    dom.suggestExtraFields.innerHTML = html;
  }

  // Limpa todos os filtros
  function resetFilters() {
    state.currentType = 'todos';
    state.currentCategory = 'todas';
    state.currentCity = 'todas';
    state.searchQuery = '';

    if (dom.citySelect) dom.citySelect.value = 'todas';
    if (dom.categorySelect) dom.categorySelect.value = 'todas';
    if (dom.searchInput) dom.searchInput.value = '';
    if (dom.searchClear) dom.searchClear.style.display = 'none';

    dom.typeTabs.forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-type') === 'todos');
    });

    applyFilters();
  }

  // Conecta ouvintes de eventos da página
  function bindEvents() {
    // Tabs de Tipo
    dom.typeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        dom.typeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentType = tab.getAttribute('data-type');
        applyFilters();
      });
    });

    // Select de Cidade
    if (dom.citySelect) {
      dom.citySelect.addEventListener('change', () => {
        state.currentCity = dom.citySelect.value;
        applyFilters();
      });
    }

    // Select de Categoria
    if (dom.categorySelect) {
      dom.categorySelect.addEventListener('change', () => {
        state.currentCategory = dom.categorySelect.value;
        applyFilters();
      });
    }

    // Busca textual com debounce
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (dom.searchClear) {
          dom.searchClear.style.display = val.length > 0 ? 'block' : 'none';
        }
        clearTimeout(state.searchDebounceTimer);
        state.searchDebounceTimer = setTimeout(() => {
          state.searchQuery = val;
          applyFilters();
        }, 200);
      });
    }

    // Limpar busca
    if (dom.searchClear) {
      dom.searchClear.addEventListener('click', () => {
        dom.searchInput.value = '';
        dom.searchClear.style.display = 'none';
        state.searchQuery = '';
        applyFilters();
      });
    }

    // Botão reset de filtros
    if (dom.resetFilterBtn) {
      dom.resetFilterBtn.addEventListener('click', resetFilters);
    }

    // Fechar Modal Maps
    if (dom.modalCloseBtn) {
      dom.modalCloseBtn.addEventListener('click', closeMapsModal);
    }
    if (dom.mapsModal) {
      dom.mapsModal.addEventListener('click', (e) => {
        if (e.target === dom.mapsModal) closeMapsModal();
      });
    }

    // Abrir/Fechar Modal de Indicação
    if (dom.openSuggestBtn) {
      dom.openSuggestBtn.addEventListener('click', openSuggestModal);
    }
    if (dom.heroSuggestBtn) {
      dom.heroSuggestBtn.addEventListener('click', openSuggestModal);
    }
    if (dom.suggestCloseBtn) {
      dom.suggestCloseBtn.addEventListener('click', closeSuggestModal);
    }
    if (dom.suggestModal) {
      dom.suggestModal.addEventListener('click', (e) => {
        if (e.target === dom.suggestModal) closeSuggestModal();
      });
    }

    // Mudança de tipo no modal de indicação
    if (dom.suggestTipoSelect) {
      dom.suggestTipoSelect.addEventListener('change', updateSuggestFields);
    }

    // Submissão do formulário de indicação pública
    if (dom.suggestForm) {
      const renderTimeInput = dom.suggestForm.querySelector('input[name="_renderTime"]');
      if (renderTimeInput) renderTimeInput.value = Date.now();

      dom.suggestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = dom.suggestForm.querySelector('button[type="submit"]');
        const origText = submitBtn.innerHTML;

        try {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

          const formData = new FormData(dom.suggestForm);
          const payload = Object.fromEntries(formData.entries());

          const res = await fetch('/api/sugerir', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const data = await res.json();
          if (data.success) {
            closeSuggestModal();
            dom.suggestForm.reset();
            showToast('Indicação enviada com sucesso! A coordenação avaliará para publicação.');
          } else {
            alert(data.error || 'Erro ao enviar indicação.');
          }
        } catch (err) {
          alert('Erro de conexão ao enviar indicação. Tente novamente.');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = origText;
        }
      });
    }

    // Tecla ESC fecha modais
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMapsModal();
        closeSuggestModal();
      }
    });

    // Sincronização em tempo real entre abas (quando o admin adiciona/exclui registros)
    window.addEventListener('storage', (e) => {
      if (!e.key || e.key === STORAGE_KEY) {
        const updated = getFromStorage();
        if (updated !== null) {
          state.items = updated.filter(i => i.status === 'ativo');
          updateStatistics();
          populateCategoryFilter();
          applyFilters();
        }
      }
    });
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadItems);
  } else {
    loadItems();
  }

})();
