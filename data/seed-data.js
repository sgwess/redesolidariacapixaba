/**
 * REDE SOLIDÁRIA CSC - DADOS INICIAIS
 * Coletivo Socialista Capixaba
 * 
 * Iniciativas, Autônomos e Vagas de Emprego Solidárias no Espírito Santo.
 * Este arquivo serve como base e fallback seguro quando o backend estiver inicializando.
 */

const SEED_DATA = [
  {
    id: "aut-isabella-cezar",
    tipo: "autonomo",
    nome: "Isabella Cezar",
    profissao: "Saúde & Bem-Estar",
    categoria: "Saúde & Bem-Estar",
    modalidade: "Presencial e Online",
    descricao: "Atendimento especializado em saúde integrativa, cuidado e bem-estar na Grande Vitória. Práticas de acolhimento e suporte comunitário.",
    beneficio: "Condições solidárias e atendimento diferenciado para militantes e apoiadores do Coletivo Socialista Capixaba.",
    cidade: "Vila Velha",
    bairro: "",
    endereco: "Vila Velha - ES",
    mapsQuery: "Vila Velha, ES",
    logoUrl: "",
    whatsapp: "",
    instagram: "isabellacezar",
    portfolio: "",
    regiaoAtendimento: "Vila Velha e Grande Vitória",
    dataCadastro: "2026-10-27T19:00:00Z",
    status: "ativo"
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SEED_DATA };
}

if (typeof window !== 'undefined') {
  window.CSC_SEED_DATA = SEED_DATA;
}
