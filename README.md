# 🚩 Rede Solidária | Coletivo Socialista Capixaba (CSC)

> **Plataforma Oficial de Apoio Mútuo e Solidariedade Econômica** aos trabalhadores, profissionais autônomos e empresas de esquerda do Espírito Santo.
> *"Nenhum companheiro fica desamparado."*

---

## 🎯 Contexto e Propósito

Durante e após os períodos eleitorais, diversos trabalhadores, profissionais liberais, prestadores de serviço e pequenas empresas declararam seu posicionamento de esquerda em defesa da classe trabalhadora. Por consequência, muitos sofreram retaliações políticas, ameaças de demissão, demissões efetivadas, cancelamentos de contratos e boicotes comerciais.

A **Rede Solidária CSC** foi concebida como uma ferramenta de contra-ataque solidário e organização popular:
1. **Empresas Solidárias**: Cafés, restaurantes, oficinas, gráficas, comércios e lojas comandadas por companheiros, com destaque para benefícios e acolhimento à militância.
2. **Profissionais Autônomos Aliados**: Advogados trabalhistas, eletricistas, psicólogos, professores particulares, terapeutas, desenvolvedores e designers prontos para prestar serviços com compromisso ético e preço justo.
3. **Vagas de Emprego**: Oportunidades de trabalho em empresas aliadas ou iniciativas cooperativas para recolocação rápida de camaradas perseguidos politicamente.

---

## 🛡️ Arquitetura de Segurança & Blindagem Anti-Hacking

Para impedir qualquer tentativa de sabotagem, invasão ou injeção de conteúdos difamatórios:

### 1. Zero Validação Insegura no Frontend
- **NENHUMA** senha ou chave mestre existe no código JavaScript do cliente.
- A autenticação administrativa é processada exclusivamente no **Backend Serverless (`/api/admin-auth`)**.
- A verificação de senha utiliza hashes criptográficos e emite **Session Tokens assinados com HMAC-SHA256 (`crypto`)** com expiração controlada (24 horas).
- Tentativas de acessar rotas de criação, edição ou exclusão sem o token assinado retornam imediatamente `401 Unauthorized` ou `403 Forbidden`.

### 2. Bloqueio de Indexação (Anti-Sitemap & Cloaking)
- A página administrativa (`gestao-segura-csc.html`) possui cabeçalhos e tags `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">`.
- `robots.txt` proíbe explicitamente o rastreamento das rotas administrativas e endpoints da API.
- Headers no `vercel.json` injetam `X-Robots-Tag: noindex, nofollow` em nível de servidor.

### 3. Proteção Anti-Força Bruta (Rate-Limiting por IP)
- Tentativas sucessivas de adivinhação de senha bloqueiam o endereço IP por 15 minutos.
- Inserção de atrasos artificiais (*timing defense*) contra ataques de enumeração.

### 4. Sanitização Rigorosa de Dados
- **Anti-XSS**: Todas as tags `<script>`, `<iframe>` arbitrárias e manipuladores de eventos maliciosos são expurgados no backend antes do armazenamento.
- **Formula Injection**: Entradas que iniciam com `=`, `+`, `-`, `@` recebem tratamento com apóstrofo `'` para neutralizar a execução de código malicioso no Google Sheets / Excel.
- **Honeypot Invisível & Time-Trap**: Formulários públicos contêm armadilhas invisíveis para anular bots automatizados.

### 5. Triagem e Moderação Obrigatória
- Sugestões públicas recebem obrigatoriamente o status `pendente` e **NUNCA** entram no ar sem a aprovação explícita da coordenação autenticada no painel administrativo.

---

## 🗺️ Funcionalidades em Destaque

- 📍 **Google Maps Interativo em Tempo Real**: Cada cadastro possui campo de endereço completo integrado com visualização interativa do Google Maps, botão de traçar rota no Maps e navegação direta no Waze.
- 🖼️ **Anexo de Logo com Otimização Inteligente no Canvas**: Permite upload de arquivos de imagem diretamente do celular ou computador, redimensionando e convertendo no navegador para WebP ultra-leve (~50KB-80KB) sem consumir largura de banda excessiva.
- 🏷️ **Segmentação Dinâmica por Categorias & Cidades do ES**: Filtros em tempo real por Vitória, Vila Velha, Serra, Cariacica, Interior ou Remoto, além de categorias sugeridas em chips de 1 clique.
- ⚡ **Busca Instantânea**: Pesquisa em tempo real com debounce, buscando por nome, serviços, endereço e benefícios para a militância.

---

## 🚀 Como Criar o Novo Repositório no GitHub e Conectar à Vercel

Para manter o projeto principal (`coletivosocialistacapixaba`) leve e desacoplado, este projeto foi construído para residir em seu próprio repositório.

### Passo 1: Inicializar o Repositório Git Localmente
Abra o terminal (PowerShell ou Bash) dentro da pasta `rede-solidaria`:

```bash
cd "c:\Users\Wes\Documents\PÁGINA INFLUENCERS CSC\rede-solidaria"

# Inicialize o repositório git independente
git init

# Adicione todos os arquivos
git add .

# Crie o primeiro commit oficial
git commit -m "feat: lancamento oficial da Rede Solidaria CSC"
```

### Passo 2: Criar o Novo Repositório no GitHub
1. Acesse seu GitHub: [https://github.com/new](https://github.com/new).
2. Nome do repositório: `rede-solidaria-csc` (ou o nome que preferir).
3. Deixe como **Público** (ou Privado) e **NÃO** marque a opção de adicionar README nem .gitignore (já criamos localmente).
4. Clique em **Create repository**.
5. No seu terminal, vincule o repositório e faça o push:

```bash
git branch -M main
git remote add origin https://github.com/sgwess/rede-solidaria-csc.git
git push -u origin main
```

---

## ☁️ Como Fazer o Deploy no Novo Projeto da Vercel

1. Acesse o painel da [Vercel](https://vercel.com/new).
2. Clique em **"Add New..."** > **"Project"**.
3. Selecione o repositório recém-criado `rede-solidaria-csc`.
4. Em **Environment Variables**, adicione as seguintes variáveis:

| Variável | Descrição | Exemplo de Valor |
| :--- | :--- | :--- |
| `CSC_ADMIN_KEY` | Chave Mestre de Administração (Senha do Painel) | `SuaSenhaForteCSC2026!#` |
| `JWT_SECRET` | Segredo para assinatura dos tokens HMAC-SHA256 | `ChaveLongaAleatoria998877` |
| `GOOGLE_SHEET_WEBHOOK_URL` | (Opcional) URL da Planilha no Google Apps Script | `https://script.google.com/macros/s/.../exec` |
| `CSC_API_SECRET` | Token secreto servidor-a-servidor para o Apps Script | `CSC_MILITANCIA_SEGURA_2026` |

5. Clique em **Deploy**. Em 30 segundos sua plataforma estará no ar com HTTPS, CDN global e funções serverless ativas!

---

## 📊 Como Ativar a Planilha do Google Sheets como Banco de Dados em Nuvem

Para que todos os cadastros fiquem salvos em rede e **nunca sumam em abas anônimas ou outros aparelhos**:

1. Crie uma nova planilha no [Google Sheets](https://sheets.new).
2. No menu superior, clique em **Extensões** > **Apps Script**.
3. Apague o código padrão e cole todo o conteúdo do arquivo [`google-apps-script.js`](./google-apps-script.js).
4. Clique em **Implantar** > **Nova implantação**.
   - Tipo: **App da Web** (ícone de engrenagem).
   - Descrição: `API Rede Solidária CSC`.
   - Executar como: **Eu (seu e-mail)**.
   - Quem pode acessar: **Qualquer pessoa** (OBRIGATÓRIO para sincronização em rede).
5. Clique em **Implantar**, autorize o acesso com sua conta Google e copie a **URL do App da Web** (termina com `/exec`).
6. Agora você pode vincular sua planilha de **3 formas fáceis**:
   - **Pelo Painel de Gestão (Mais fácil)**: Acesse `/gestao-segura-csc.html`, clique em **"Configurar URL"** no banner de integração no topo, cole a URL e clique em **"Testar & Conectar"**!
   - **No arquivo local `config.js`**: Abra `config.js` e cole a URL no campo `googleSheetWebhookUrl`.
   - **Na Vercel**: Adicione a variável de ambiente `GOOGLE_SHEET_WEBHOOK_URL` e faça o redeploy.

---

## 🔑 Credenciais Padrão para Testes Locais

- **URL do Painel de Gestão**: `/gestao-segura-csc.html`
- **Chave Mestre Padrão (Local)**: `CSC_REDE_SOLIDARIA_2026`
*(Em produção na Vercel, altere para sua chave secreta na variável `CSC_ADMIN_KEY`)*.

---

*Coletivo Socialista Capixaba • Organização, Solidariedade e Luta Popular no Espírito Santo.*
