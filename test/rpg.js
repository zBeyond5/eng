(function () {
  "use strict";

  if (window._rpg && window._rpg.__loaded) {
    console.warn("[RPG Overlay] já carregado");
    return;
  }

  const CONFIG = {
    PREFIX: "/rpg ",
    STORAGE_KEY: "_rpg_state_v2",
    GRID_SIZE: 5,
    DEBUG: false,
    HEADERS: { CHAT_NORMAL: 1146, CHAT_SHOUT: 25, CHAT_WHISPER: 1678 },
    TICK_MS: 100,
    FLEE_CHANCE: 0.5,
    XP_BASE: 50,
    XP_GROWTH: 1.32,
    MAX_FLOOR: 6,
    CRIT_CHANCE: 0.12,
    CRIT_MULT: 1.8,
    CHUNK_SIZE: 40,
    CHUNK_TIMEOUT_MS: 8000,
    DUEL_TIMEOUT_MS: 30000,
    SOM_PADRAO: true,
    GOLD_BASE_DROP: 4,
  };

  function log(...args) { if (CONFIG.DEBUG) console.log("[RPG]", ...args); }
  function warn(...args) { if (CONFIG.DEBUG) console.warn("[RPG]", ...args); }

  const RpgCodec = {
    encode(str) {
      const bytes = new TextEncoder().encode(str);
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      return btoa(binary);
    },
    decode(b64) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (e) {
        warn("decode falhou", b64, e);
        return null;
      }
    },
  };

  const ELEMENTOS = ["fisico", "fogo", "gelo", "veneno", "sombra", "luz"];

  const MATRIZ_ELEMENTAL = {
    fisico: { forte: "sombra", fraco: "luz" },
    fogo: { forte: "gelo", fraco: "veneno" },
    gelo: { forte: "fogo", fraco: "fisico" },
    veneno: { forte: "luz", fraco: "fogo" },
    sombra: { forte: "luz", fraco: "fisico" },
    luz: { forte: "sombra", fraco: "veneno" },
  };

  function multiplicadorElemental(atacante, defensor) {
    const regra = MATRIZ_ELEMENTAL[atacante];
    if (!regra) return 1;
    if (regra.forte === defensor) return 1.5;
    if (regra.fraco === defensor) return 0.7;
    return 1;
  }

  const MONSTER_TABLE = [
    { id: "rato", nome: "Rato do Esgoto", andar: 1, hpMin: 8, hpMax: 14, atk: 2, def: 0, xp: 12, gold: 3, elemento: "fisico", dropChance: 0.25, drops: ["pocao_pequena"] },
    { id: "aranha", nome: "Aranha Peluda", andar: 1, hpMin: 12, hpMax: 18, atk: 3, def: 1, xp: 18, gold: 5, elemento: "veneno", dropChance: 0.3, drops: ["antidoto", "pocao_pequena"] },
    { id: "morcego", nome: "Morcego Sombrio", andar: 1, hpMin: 10, hpMax: 16, atk: 3, def: 0, xp: 15, gold: 4, elemento: "sombra", dropChance: 0.22, drops: ["pocao_pequena"] },
    { id: "slime", nome: "Slime Verde", andar: 1, hpMin: 14, hpMax: 20, atk: 2, def: 2, xp: 16, gold: 5, elemento: "veneno", dropChance: 0.28, drops: ["antidoto"] },
    { id: "vagalume", nome: "Vagalume Sagrado", andar: 1, hpMin: 9, hpMax: 13, atk: 2, def: 0, xp: 11, gold: 3, elemento: "luz", dropChance: 0.2, drops: ["pocao_pequena"] },
    { id: "goblin", nome: "Goblin Arruaceiro", andar: 2, hpMin: 18, hpMax: 26, atk: 4, def: 1, xp: 26, gold: 8, elemento: "fisico", dropChance: 0.35, drops: ["pocao_media", "adaga_ferro"] },
    { id: "orc", nome: "Orc Selvagem", andar: 2, hpMin: 24, hpMax: 32, atk: 5, def: 2, xp: 32, gold: 10, elemento: "fisico", dropChance: 0.35, drops: ["pocao_media", "escudo_madeira"] },
    { id: "kobold", nome: "Kobold Ladino", andar: 2, hpMin: 16, hpMax: 22, atk: 4, def: 1, xp: 24, gold: 9, elemento: "sombra", dropChance: 0.3, drops: ["pocao_media"] },
    { id: "harpia", nome: "Harpia Uivante", andar: 2, hpMin: 20, hpMax: 28, atk: 5, def: 0, xp: 30, gold: 9, elemento: "gelo", dropChance: 0.32, drops: ["pocao_media", "amuleto_vento"] },
    { id: "elementalfogo", nome: "Elemental de Fogo Menor", andar: 2, hpMin: 22, hpMax: 30, atk: 6, def: 1, xp: 34, gold: 11, elemento: "fogo", dropChance: 0.34, drops: ["pocao_media"] },
    { id: "esqueleto", nome: "Esqueleto Errante", andar: 3, hpMin: 26, hpMax: 34, atk: 6, def: 3, xp: 40, gold: 14, elemento: "sombra", dropChance: 0.38, drops: ["pocao_media", "espada_osso"] },
    { id: "zumbi", nome: "Zumbi Apodrecido", andar: 3, hpMin: 30, hpMax: 40, atk: 5, def: 4, xp: 42, gold: 14, elemento: "veneno", dropChance: 0.36, drops: ["antidoto", "armadura_couro"] },
    { id: "ogro", nome: "Ogro Faminto", andar: 3, hpMin: 36, hpMax: 46, atk: 8, def: 3, xp: 50, gold: 18, elemento: "fisico", dropChance: 0.4, drops: ["pocao_grande", "clava_ogro"] },
    { id: "gnomogelo", nome: "Gnomo de Gelo", andar: 3, hpMin: 24, hpMax: 32, atk: 6, def: 2, xp: 38, gold: 13, elemento: "gelo", dropChance: 0.35, drops: ["pocao_media"] },
    { id: "sombraerrante", nome: "Sombra Errante", andar: 3, hpMin: 28, hpMax: 36, atk: 7, def: 2, xp: 44, gold: 15, elemento: "sombra", dropChance: 0.37, drops: ["pocao_media", "manto_sombrio"] },
    { id: "minotauro", nome: "Minotauro Jovem", andar: 4, hpMin: 40, hpMax: 52, atk: 9, def: 4, xp: 60, gold: 22, elemento: "fisico", dropChance: 0.42, drops: ["pocao_grande", "machado_duplo"] },
    { id: "hidra", nome: "Filhote de Hidra", andar: 4, hpMin: 44, hpMax: 56, atk: 8, def: 5, xp: 64, gold: 24, elemento: "gelo", dropChance: 0.4, drops: ["pocao_grande"] },
    { id: "gargula", nome: "Gárgula de Pedra", andar: 4, hpMin: 48, hpMax: 60, atk: 7, def: 8, xp: 62, gold: 22, elemento: "fisico", dropChance: 0.38, drops: ["escudo_ferro"] },
    { id: "necromante", nome: "Necromante Aprendiz", andar: 4, hpMin: 34, hpMax: 44, atk: 10, def: 2, xp: 58, gold: 23, elemento: "sombra", dropChance: 0.4, drops: ["cajado_ossos", "pocao_grande"] },
    { id: "salamandra", nome: "Salamandra de Fogo", andar: 4, hpMin: 38, hpMax: 48, atk: 9, def: 3, xp: 56, gold: 21, elemento: "fogo", dropChance: 0.39, drops: ["pocao_grande"] },
    { id: "wyvern", nome: "Wyvern Jovem", andar: 5, hpMin: 52, hpMax: 66, atk: 12, def: 6, xp: 80, gold: 30, elemento: "gelo", dropChance: 0.44, drops: ["pocao_grande", "lanca_wyvern"] },
    { id: "titafuria", nome: "Titã da Fúria", andar: 5, hpMin: 60, hpMax: 74, atk: 13, def: 7, xp: 88, gold: 33, elemento: "fisico", dropChance: 0.45, drops: ["armadura_placas"] },
    { id: "espectro", nome: "Espectro Vingativo", andar: 5, hpMin: 46, hpMax: 58, atk: 14, def: 3, xp: 84, gold: 32, elemento: "sombra", dropChance: 0.43, drops: ["pocao_grande", "amuleto_sombra"] },
    { id: "querubim", nome: "Querubim Caído", andar: 5, hpMin: 50, hpMax: 62, atk: 12, def: 5, xp: 82, gold: 31, elemento: "luz", dropChance: 0.42, drops: ["pocao_grande"] },
    { id: "basilisco", nome: "Basilisco Jovem", andar: 5, hpMin: 54, hpMax: 68, atk: 11, def: 8, xp: 86, gold: 34, elemento: "veneno", dropChance: 0.44, drops: ["antidoto", "pocao_grande"] },
    { id: "cavaleironegro", nome: "Cavaleiro Negro", andar: 6, hpMin: 70, hpMax: 88, atk: 16, def: 10, xp: 120, gold: 45, elemento: "sombra", dropChance: 0.48, drops: ["espada_negra", "pocao_grande"] },
    { id: "golemgranito", nome: "Golem de Granito", andar: 6, hpMin: 90, hpMax: 110, atk: 12, def: 14, xp: 130, gold: 48, elemento: "fisico", dropChance: 0.46, drops: ["armadura_granito"] },
    { id: "feiticeirogelo", nome: "Feiticeiro do Gelo", andar: 6, hpMin: 60, hpMax: 76, atk: 18, def: 6, xp: 125, gold: 46, elemento: "gelo", dropChance: 0.47, drops: ["cajado_gelo"] },
    { id: "demoniomenor", nome: "Demônio Menor", andar: 6, hpMin: 68, hpMax: 84, atk: 17, def: 8, xp: 128, gold: 47, elemento: "sombra", dropChance: 0.47, drops: ["pocao_grande", "elixir_forca"] },
    { id: "fenixcinzas", nome: "Fênix das Cinzas", andar: 6, hpMin: 72, hpMax: 90, atk: 15, def: 9, xp: 132, gold: 49, elemento: "fogo", dropChance: 0.48, drops: ["pena_fenix"] },
  ];

  const BOSS_TABLE = [
    { id: "rei_ratos", nome: "Rei dos Ratos", andar: 1, hp: 70, atk: 6, def: 2, xp: 100, gold: 30, elemento: "fisico", drops: ["pocao_grande", "adaga_ferro"] },
    { id: "rei_goblin", nome: "Rei Goblin", andar: 2, hp: 110, atk: 9, def: 4, xp: 160, gold: 45, elemento: "fisico", drops: ["escudo_ferro", "pocao_grande"] },
    { id: "senhor_esqueletos", nome: "Senhor dos Esqueletos", andar: 3, hp: 150, atk: 12, def: 5, xp: 220, gold: 60, elemento: "sombra", drops: ["espada_osso", "manto_sombrio"] },
    { id: "matriarca_hidra", nome: "Matriarca da Hidra", andar: 4, hp: 200, atk: 15, def: 8, xp: 300, gold: 80, elemento: "gelo", drops: ["lanca_wyvern", "pocao_grande"] },
    { id: "arconte_caido", nome: "Arconte Caído", andar: 5, hp: 260, atk: 19, def: 10, xp: 400, gold: 100, elemento: "sombra", drops: ["amuleto_sombra", "elixir_forca"] },
    { id: "dragao_ancestral", nome: "Dragão Ancestral", andar: 6, hp: 360, atk: 24, def: 14, xp: 600, gold: 150, elemento: "fogo", drops: ["espada_negra", "pena_fenix", "armadura_granito"] },
  ];

  const ITEM_TABLE = {
    pocao_pequena: { nome: "Poção de Cura Pequena", tipo: "cura", cura: 15, preco: 10 },
    pocao_media: { nome: "Poção de Cura Média", tipo: "cura", cura: 35, preco: 25 },
    pocao_grande: { nome: "Poção de Cura Grande", tipo: "cura", cura: 65, preco: 50 },
    antidoto: { nome: "Antídoto", tipo: "cura_status", removeStatus: "veneno", preco: 15 },
    elixir_forca: { nome: "Elixir da Força", tipo: "buff", statusAplicado: "fortalecimento", duracao: 3, preco: 60 },
    elixir_gelo: { nome: "Elixir de Resistência ao Gelo", tipo: "buff", statusAplicado: "resistencia_gelo", duracao: 3, preco: 55 },
    po_atordoante: { nome: "Pó Atordoante", tipo: "ofensivo", statusAplicado: "atordoamento", duracao: 1, preco: 40 },
    veneno_extrato: { nome: "Extrato Venenoso", tipo: "ofensivo", statusAplicado: "veneno", duracao: 3, preco: 35 },
    pena_fenix: { nome: "Pena de Fênix", tipo: "revive", curaPercentual: 1, preco: 200 },
    pergaminho_fuga: { nome: "Pergaminho de Fuga Garantida", tipo: "fuga_garantida", preco: 45 },
    pergaminho_identificar: { nome: "Pergaminho de Identificação", tipo: "utilitario", preco: 20 },
    saco_ouro: { nome: "Saco de Ouro Extra", tipo: "ouro", ouro: 25, preco: 0 },
  };

  const EQUIPMENT_TABLE = {
    adaga_ferro: { nome: "Adaga de Ferro", slot: "arma", atk: 3, def: 0, hp: 0, elemento: "fisico", preco: 40 },
    espada_osso: { nome: "Espada de Osso", slot: "arma", atk: 6, def: 0, hp: 0, elemento: "sombra", preco: 90 },
    clava_ogro: { nome: "Clava de Ogro", slot: "arma", atk: 8, def: -1, hp: 10, elemento: "fisico", preco: 130 },
    machado_duplo: { nome: "Machado Duplo", slot: "arma", atk: 11, def: 0, hp: 0, elemento: "fisico", preco: 190 },
    cajado_ossos: { nome: "Cajado de Ossos", slot: "arma", atk: 9, def: 0, hp: 5, elemento: "sombra", preco: 200 },
    lanca_wyvern: { nome: "Lança de Wyvern", slot: "arma", atk: 13, def: 1, hp: 0, elemento: "gelo", preco: 260 },
    cajado_gelo: { nome: "Cajado de Gelo Eterno", slot: "arma", atk: 15, def: 0, hp: 0, elemento: "gelo", preco: 320 },
    espada_negra: { nome: "Espada Negra Amaldiçoada", slot: "arma", atk: 19, def: 2, hp: -10, elemento: "sombra", preco: 420 },
    escudo_madeira: { nome: "Escudo de Madeira", slot: "armadura", atk: 0, def: 3, hp: 5, elemento: "fisico", preco: 35 },
    armadura_couro: { nome: "Armadura de Couro", slot: "armadura", atk: 0, def: 5, hp: 10, elemento: "fisico", preco: 80 },
    escudo_ferro: { nome: "Escudo de Ferro", slot: "armadura", atk: 0, def: 8, hp: 15, elemento: "fisico", preco: 150 },
    manto_sombrio: { nome: "Manto Sombrio", slot: "armadura", atk: 1, def: 6, hp: 12, elemento: "sombra", preco: 170 },
    armadura_placas: { nome: "Armadura de Placas", slot: "armadura", atk: -1, def: 14, hp: 30, elemento: "fisico", preco: 280 },
    armadura_granito: { nome: "Armadura de Granito", slot: "armadura", atk: -2, def: 20, hp: 50, elemento: "fisico", preco: 400 },
    amuleto_vento: { nome: "Amuleto do Vento", slot: "acessorio", atk: 2, def: 1, hp: 5, elemento: "gelo", preco: 60 },
    amuleto_sombra: { nome: "Amuleto Sombrio", slot: "acessorio", atk: 4, def: 2, hp: 10, elemento: "sombra", preco: 220 },
    anel_vitalidade: { nome: "Anel da Vitalidade", slot: "acessorio", atk: 0, def: 0, hp: 40, elemento: "luz", preco: 180 },
    bracelete_forca: { nome: "Bracelete da Força", slot: "acessorio", atk: 5, def: 0, hp: 0, elemento: "fisico", preco: 160 },
  };

  const ACHIEVEMENT_TABLE = [
    { id: "primeiro_sangue", nome: "Primeiro Sangue", descricao: "Derrote seu primeiro monstro", tipo: "monstrosDerrotados", meta: 1, ouro: 10 },
    { id: "cacador_novato", nome: "Caçador Novato", descricao: "Derrote 10 monstros", tipo: "monstrosDerrotados", meta: 10, ouro: 30 },
    { id: "cacador_experiente", nome: "Caçador Experiente", descricao: "Derrote 50 monstros", tipo: "monstrosDerrotados", meta: 50, ouro: 100 },
    { id: "cacador_lendario", nome: "Caçador Lendário", descricao: "Derrote 150 monstros", tipo: "monstrosDerrotados", meta: 150, ouro: 300 },
    { id: "nivel5", nome: "Aprendiz", descricao: "Alcance o nível 5", tipo: "nivel", meta: 5, ouro: 20 },
    { id: "nivel10", nome: "Aventureiro", descricao: "Alcance o nível 10", tipo: "nivel", meta: 10, ouro: 50 },
    { id: "nivel20", nome: "Veterano", descricao: "Alcance o nível 20", tipo: "nivel", meta: 20, ouro: 120 },
    { id: "nivel30", nome: "Mestre", descricao: "Alcance o nível 30", tipo: "nivel", meta: 30, ouro: 250 },
    { id: "andar2", nome: "Explorador", descricao: "Alcance o andar 2", tipo: "andar", meta: 2, ouro: 15 },
    { id: "andar4", nome: "Espeleólogo", descricao: "Alcance o andar 4", tipo: "andar", meta: 4, ouro: 60 },
    { id: "andar6", nome: "Desbravador do Abismo", descricao: "Alcance o andar 6", tipo: "andar", meta: 6, ouro: 150 },
    { id: "rico1", nome: "Poupador", descricao: "Acumule 200 de ouro", tipo: "ouro", meta: 200, ouro: 20 },
    { id: "rico2", nome: "Comerciante", descricao: "Acumule 1000 de ouro", tipo: "ouro", meta: 1000, ouro: 80 },
    { id: "rico3", nome: "Magnata", descricao: "Acumule 3000 de ouro", tipo: "ouro", meta: 3000, ouro: 200 },
    { id: "primeira_missao", nome: "Cumpridor de Missões", descricao: "Complete sua primeira missão", tipo: "missoes", meta: 1, ouro: 15 },
    { id: "cinco_missoes", nome: "Mercenário", descricao: "Complete 5 missões", tipo: "missoes", meta: 5, ouro: 70 },
    { id: "primeiro_boss", nome: "Matador de Chefes", descricao: "Derrote seu primeiro chefe", tipo: "chefesDerrotados", meta: 1, ouro: 40 },
    { id: "tres_bosses", nome: "Flagelo dos Chefes", descricao: "Derrote 3 chefes", tipo: "chefesDerrotados", meta: 3, ouro: 150 },
    { id: "primeiro_duelo", nome: "Duelista", descricao: "Vença seu primeiro duelo PvP", tipo: "duelosVencidos", meta: 1, ouro: 25 },
    { id: "campeao_duelos", nome: "Campeão de Duelos", descricao: "Vença 10 duelos PvP", tipo: "duelosVencidos", meta: 10, ouro: 200 },
  ];

  const QUEST_TABLE = [
    { id: "q_ratos", nome: "Praga de Ratos", descricao: "Derrote 5 ratos do esgoto", tipo: "matar", alvo: "rato", quantidade: 5, xp: 40, ouro: 20, item: null },
    { id: "q_aranhas", nome: "Controle de Pragas", descricao: "Derrote 5 aranhas peludas", tipo: "matar", alvo: "aranha", quantidade: 5, xp: 45, ouro: 22, item: "antidoto" },
    { id: "q_goblins", nome: "Fim do Bando Goblin", descricao: "Derrote 8 goblins arruaceiros", tipo: "matar", alvo: "goblin", quantidade: 8, xp: 90, ouro: 40, item: null },
    { id: "q_esqueletos", nome: "Descanso Eterno", descricao: "Derrote 6 esqueletos errantes", tipo: "matar", alvo: "esqueleto", quantidade: 6, xp: 130, ouro: 55, item: "pocao_media" },
    { id: "q_ogros", nome: "Fome Saciada", descricao: "Derrote 4 ogros famintos", tipo: "matar", alvo: "ogro", quantidade: 4, xp: 170, ouro: 70, item: null },
    { id: "q_wyvern", nome: "Caçada Alada", descricao: "Derrote 3 wyverns jovens", tipo: "matar", alvo: "wyvern", quantidade: 3, xp: 240, ouro: 100, item: "pocao_grande" },
    { id: "q_andar3", nome: "Descida ao Terceiro Andar", descricao: "Alcance o andar 3", tipo: "andar", alvo: null, quantidade: 3, xp: 100, ouro: 50, item: null },
    { id: "q_andar5", nome: "As Profundezas", descricao: "Alcance o andar 5", tipo: "andar", alvo: null, quantidade: 5, xp: 260, ouro: 110, item: null },
    { id: "q_tesouros", nome: "Caçador de Tesouros", descricao: "Colete 6 tesouros", tipo: "tesouro", alvo: null, quantidade: 6, xp: 80, ouro: 45, item: null },
    { id: "q_boss1", nome: "O Rei Deve Cair", descricao: "Derrote o Rei dos Ratos", tipo: "chefe", alvo: "rei_ratos", quantidade: 1, xp: 150, ouro: 60, item: "escudo_madeira" },
  ];

  const STATUS_EFFECT_TABLE = {
    veneno: { nome: "Envenenado", danoPorTurno: 0.08, reduzAtk: 0, reduzDef: 0, pulaTurno: false },
    atordoamento: { nome: "Atordoado", danoPorTurno: 0, reduzAtk: 0, reduzDef: 0, pulaTurno: true },
    fraqueza: { nome: "Enfraquecido", danoPorTurno: 0, reduzAtk: 0.25, reduzDef: 0, pulaTurno: false },
    fortalecimento: { nome: "Fortalecido", danoPorTurno: 0, reduzAtk: -0.3, reduzDef: 0, pulaTurno: false },
    resistencia_gelo: { nome: "Resistência ao Gelo", danoPorTurno: 0, reduzAtk: 0, reduzDef: -0.2, pulaTurno: false },
  };

  let state = null;
  let floorsCache = {};
  let grid = null;
  let remotePlayers = {};
  let messageQueue = [];
  let queueTimer = null;
  let battle = null;
  let duel = null;
  let uiRefs = {};
  let hooksInstalled = false;
  let originalSocketSend = null;
  let originalSocketOnMessage = null;
  let chunkBuffers = {};
  let abaAtiva = "status";
  let audioCtx = null;

  function defaultState() {
    return {
      nome: obterNomeJogador(),
      nivel: 1,
      hp: 30,
      hpMax: 30,
      atkBase: 5,
      defBase: 2,
      xp: 0,
      xpProximo: CONFIG.XP_BASE,
      ouro: 0,
      andar: 1,
      andarMaisAlto: 1,
      x: 2,
      y: 2,
      seedBase: gerarSeedPadrao(),
      inventario: [{ id: "pocao_pequena", qtd: 3 }],
      itensEquip: [],
      equipado: { arma: null, armadura: null, acessorio: null },
      statusEfeitos: [],
      quests: { ativas: [], concluidas: [] },
      conquistas: [],
      estatisticas: {
        monstrosDerrotados: 0,
        chefesDerrotados: 0,
        tesourosColetados: 0,
        duelosVencidos: 0,
        duelosPerdidos: 0,
        ouroTotalGanho: 0,
        andaresVisitados: 1,
      },
      config: { somAtivo: CONFIG.SOM_PADRAO },
      floorProgress: {},
    };
  }

  function gerarSeedPadrao() {
    const roomId = obterIdQuarto();
    let seed = 0;
    for (let i = 0; i < roomId.length; i++) seed = (seed * 31 + roomId.charCodeAt(i)) >>> 0;
    return seed || 12345;
  }

  function obterIdQuarto() {
    try {
      if (window.HabboClientController && window.HabboClientController.roomId) return String(window.HabboClientController.roomId);
      if (window._lens && window._lens.roomId) return String(window._lens.roomId);
    } catch (e) {}
    return "quarto-padrao";
  }

  function obterNomeJogador() {
    try {
      if (window.HabboClientController && window.HabboClientController.userName) return window.HabboClientController.userName;
      if (window._lens && window._lens.userName) return window._lens.userName;
    } catch (e) {}
    return "Jogador" + Math.floor(Math.random() * 9999);
  }

  function salvarEstado() {
    try {
      sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      warn("falha ao salvar", e);
    }
  }

  function carregarEstado() {
    try {
      const raw = sessionStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.nivel === "number") return migrarEstado(parsed);
      }
    } catch (e) {
      warn("estado corrompido", e);
    }
    return defaultState();
  }

  function migrarEstado(parsed) {
    const base = defaultState();
    const mesclado = Object.assign({}, base, parsed);
    mesclado.equipado = Object.assign({}, base.equipado, parsed.equipado || {});
    mesclado.estatisticas = Object.assign({}, base.estatisticas, parsed.estatisticas || {});
    mesclado.quests = Object.assign({}, base.quests, parsed.quests || {});
    mesclado.config = Object.assign({}, base.config, parsed.config || {});
    return mesclado;
  }

  function rngFromSeed(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gerarGridParaAndar(andar) {
    if (floorsCache[andar]) return floorsCache[andar];
    const seed = (state.seedBase + andar * 7919) >>> 0;
    const rand = rngFromSeed(seed);
    const tamanho = CONFIG.GRID_SIZE;
    const novoGrid = [];
    for (let y = 0; y < tamanho; y++) {
      const linha = [];
      for (let x = 0; x < tamanho; x++) linha.push({ tipo: "vazio", monstroId: null, revelado: false });
      novoGrid.push(linha);
    }
    const centro = Math.floor(tamanho / 2);
    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        if (x === centro && y === centro) continue;
        const r = rand();
        if (r < 0.32) {
          novoGrid[y][x].tipo = "monstro";
          const candidatos = MONSTER_TABLE.filter((m) => m.andar === andar);
          const pool = candidatos.length ? candidatos : MONSTER_TABLE;
          novoGrid[y][x].monstroId = pool[Math.floor(rand() * pool.length)].id;
        } else if (r < 0.48) {
          novoGrid[y][x].tipo = "tesouro";
        }
      }
    }
    const cantos = [[0, 0], [0, tamanho - 1], [tamanho - 1, 0], [tamanho - 1, tamanho - 1]];
    const cantoBoss = cantos[Math.floor(rand() * cantos.length)];
    novoGrid[cantoBoss[1]][cantoBoss[0]].tipo = "chefe";
    const bossDoAndar = BOSS_TABLE.find((b) => b.andar === andar) || BOSS_TABLE[0];
    novoGrid[cantoBoss[1]][cantoBoss[0]].monstroId = bossDoAndar.id;

    const cantosRestantes = cantos.filter((c) => c[0] !== cantoBoss[0] || c[1] !== cantoBoss[1]);
    const cantoEscada = cantosRestantes[Math.floor(rand() * cantosRestantes.length)];
    novoGrid[cantoEscada[1]][cantoEscada[0]].tipo = "escada";
    novoGrid[cantoEscada[1]][cantoEscada[0]].monstroId = null;

    floorsCache[andar] = novoGrid;
    return novoGrid;
  }

  function carregarProgressoDoAndar(andar) {
    grid = gerarGridParaAndar(andar);
    const salvo = state.floorProgress[andar];
    if (salvo) {
      for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
        for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
          if (salvo[y] && salvo[y][x]) grid[y][x].revelado = salvo[y][x];
        }
      }
    }
  }

  function salvarProgressoDoAndar(andar) {
    const revelados = grid.map((linha) => linha.map((c) => c.revelado));
    state.floorProgress[andar] = revelados;
  }

  function enfileirarMensagem(remetente, payload) {
    messageQueue.push({ remetente, payload, ts: Date.now() });
  }

  function iniciarProcessadorDeFila() {
    if (queueTimer) return;
    queueTimer = setInterval(() => {
      if (messageQueue.length === 0) return;
      const item = messageQueue.shift();
      try {
        processarPayloadRemoto(item.remetente, item.payload);
      } catch (e) {
        warn("erro ao processar fila", e);
      }
    }, CONFIG.TICK_MS);
  }

  function pararProcessadorDeFila() {
    if (queueTimer) clearInterval(queueTimer);
    queueTimer = null;
    messageQueue = [];
  }

  function instalarHooks() {
    if (hooksInstalled) return;
    if (!window._hubSocket) {
      warn("_hubSocket ausente, modo local apenas");
      return;
    }
    const socket = window._hubSocket;
    if (typeof socket.addMessageListener === "function") {
      socket.addMessageListener(CONFIG.HEADERS.CHAT_NORMAL, onChatHeaderRecebido);
      socket.addMessageListener(CONFIG.HEADERS.CHAT_SHOUT, onChatHeaderRecebido);
      socket.addMessageListener(CONFIG.HEADERS.CHAT_WHISPER, onChatHeaderRecebido);
    } else if (typeof socket.onMessage === "function" || typeof socket.onmessage === "function") {
      originalSocketOnMessage = socket.onmessage || socket.onMessage;
      const wrapped = function (evt) {
        try {
          interceptarEventoBruto(evt);
        } catch (e) {
          warn("erro wrapper onmessage", e);
        }
        if (typeof originalSocketOnMessage === "function") return originalSocketOnMessage.call(socket, evt);
      };
      if ("onmessage" in socket) socket.onmessage = wrapped;
      if ("onMessage" in socket) socket.onMessage = wrapped;
    }
    if (typeof socket.send === "function") originalSocketSend = socket.send.bind(socket);
    hooksInstalled = true;
  }

  function desinstalarHooks() {
    if (!hooksInstalled) return;
    const socket = window._hubSocket;
    try {
      if (socket && typeof socket.removeMessageListener === "function") {
        socket.removeMessageListener(CONFIG.HEADERS.CHAT_NORMAL, onChatHeaderRecebido);
        socket.removeMessageListener(CONFIG.HEADERS.CHAT_SHOUT, onChatHeaderRecebido);
        socket.removeMessageListener(CONFIG.HEADERS.CHAT_WHISPER, onChatHeaderRecebido);
      } else if (socket && originalSocketOnMessage) {
        if ("onmessage" in socket) socket.onmessage = originalSocketOnMessage;
        if ("onMessage" in socket) socket.onMessage = originalSocketOnMessage;
      }
    } catch (e) {
      warn("erro ao remover hooks", e);
    }
    hooksInstalled = false;
    originalSocketOnMessage = null;
  }

  function onChatHeaderRecebido(pacote) {
    try {
      const texto = pacote && (pacote.mensagem || pacote.message || pacote.texto);
      const remetente = (pacote && (pacote.remetente || pacote.sender || pacote.nome)) || "desconhecido";
      if (typeof texto === "string") processarLinhaDeChat(remetente, texto);
    } catch (e) {
      warn("erro onChatHeaderRecebido", e);
    }
  }

  function interceptarEventoBruto(evt) {
    if (!evt || typeof evt.data !== "string") return;
    if (window._lens && typeof window._lens.parseIncoming === "function") {
      const parsed = window._lens.parseIncoming(evt.data);
      if (parsed && parsed.header && ehHeaderDeChat(parsed.header)) onChatHeaderRecebido(parsed);
      return;
    }
    const idx = evt.data.indexOf(CONFIG.PREFIX);
    if (idx !== -1) {
      const resto = evt.data.slice(idx);
      if (resto.split(" ").length >= 2) processarLinhaDeChat("desconhecido", resto);
    }
  }

  function ehHeaderDeChat(header) {
    return header === CONFIG.HEADERS.CHAT_NORMAL || header === CONFIG.HEADERS.CHAT_SHOUT || header === CONFIG.HEADERS.CHAT_WHISPER;
  }

  function processarLinhaDeChat(remetente, texto) {
    if (typeof texto !== "string" || !texto.startsWith(CONFIG.PREFIX)) return;
    const payloadB64 = texto.slice(CONFIG.PREFIX.length).trim();
    if (!payloadB64) return;
    if (remetente === state.nome) return;

    if (payloadB64.startsWith("c:")) {
      processarChunk(remetente, payloadB64);
      return;
    }

    const decodificado = RpgCodec.decode(payloadB64);
    if (decodificado === null) return;
    enfileirarMensagem(remetente, decodificado);
  }

  function processarChunk(remetente, payloadComPrefixo) {
    const corpo = payloadComPrefixo.slice(2);
    const partes = corpo.split(":");
    if (partes.length < 4) return;
    const msgId = partes[0];
    const indice = parseInt(partes[1], 10);
    const total = parseInt(partes[2], 10);
    const dado = partes.slice(3).join(":");
    const chave = remetente + "|" + msgId;

    if (!chunkBuffers[chave]) {
      chunkBuffers[chave] = { partes: new Array(total).fill(null), total, ts: Date.now() };
    }
    chunkBuffers[chave].partes[indice] = dado;

    const buffer = chunkBuffers[chave];
    if (buffer.partes.every((p) => p !== null)) {
      const completo = buffer.partes.join("");
      delete chunkBuffers[chave];
      const decodificado = RpgCodec.decode(completo);
      if (decodificado !== null) enfileirarMensagem(remetente, decodificado);
    }
  }

  function limparChunksExpirados() {
    const agora = Date.now();
    Object.keys(chunkBuffers).forEach((chave) => {
      if (agora - chunkBuffers[chave].ts > CONFIG.CHUNK_TIMEOUT_MS) delete chunkBuffers[chave];
    });
  }

  function enviarComandoRPG(comandoTexto) {
    const payload = RpgCodec.encode(comandoTexto);
    if (payload.length <= CONFIG.CHUNK_SIZE) {
      enviarLinhaChat(CONFIG.PREFIX + payload);
      return;
    }
    const msgId = Math.random().toString(36).slice(2, 8);
    const partes = [];
    for (let i = 0; i < payload.length; i += CONFIG.CHUNK_SIZE) partes.push(payload.slice(i, i + CONFIG.CHUNK_SIZE));
    partes.forEach((parte, indice) => {
      const linha = CONFIG.PREFIX + "c:" + msgId + ":" + indice + ":" + partes.length + ":" + parte;
      enviarLinhaChat(linha);
    });
  }

  function enviarLinhaChat(linhaCompleta) {
    if (originalSocketSend) {
      try {
        originalSocketSend(CONFIG.HEADERS.CHAT_NORMAL, linhaCompleta);
        return;
      } catch (e) {
        warn("falha no send direto, usando fallback DOM", e);
      }
    }
    enviarViaCampoDeChatDOM(linhaCompleta);
  }

  function enviarViaCampoDeChatDOM(texto) {
    const campo = document.querySelector("#chat-input") || document.querySelector('input[name="chat"]') || document.querySelector(".chat-input textarea");
    if (!campo) {
      warn("campo de chat não encontrado para fallback");
      return;
    }
    const valorAnterior = campo.value;
    campo.value = texto;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    campo.value = valorAnterior;
  }

  function processarPayloadRemoto(remetente, texto) {
    const partes = texto.split(" ");
    const tipo = partes[0];
    switch (tipo) {
      case "pos": {
        const x = parseInt(partes[1], 10);
        const y = parseInt(partes[2], 10);
        const nivel = parseInt(partes[3], 10) || 1;
        const andar = parseInt(partes[4], 10) || 1;
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          remotePlayers[remetente] = { x, y, nivel, andar };
          if (andar === state.andar) desenharGrid();
        }
        break;
      }
      case "log":
        adicionarLog(`[${remetente}] ${partes.slice(1).join(" ")}`);
        break;
      case "duelo_desafio":
        receberDesafioDuelo(remetente);
        break;
      case "duelo_aceite":
        receberAceiteDuelo(remetente);
        break;
      case "duelo_recusa":
        if (duel && duel.oponente === remetente) {
          adicionarLog(`${remetente} recusou o duelo.`);
          duel = null;
        }
        break;
      case "duelo_acao":
        receberAcaoDuelo(remetente, partes.slice(1).join(" "));
        break;
      default:
        log("comando remoto desconhecido:", texto);
    }
  }

  function propagarPosicao() {
    enviarComandoRPG(`pos ${state.x} ${state.y} ${state.nivel} ${state.andar}`);
  }

  function propagarLog(mensagem) {
    enviarComandoRPG(`log ${mensagem}`);
  }

  function atributoTotal(nome) {
    let valor = nome === "atk" ? state.atkBase : nome === "def" ? state.defBase : state.hpMax;
    ["arma", "armadura", "acessorio"].forEach((slot) => {
      const idEquip = state.equipado[slot];
      if (!idEquip) return;
      const item = EQUIPMENT_TABLE[idEquip];
      if (!item) return;
      if (nome === "atk") valor += item.atk || 0;
      if (nome === "def") valor += item.def || 0;
      if (nome === "hp") valor += item.hp || 0;
    });
    return Math.max(1, valor);
  }

  function elementoDoJogador() {
    const idArma = state.equipado.arma;
    if (idArma && EQUIPMENT_TABLE[idArma]) return EQUIPMENT_TABLE[idArma].elemento || "fisico";
    return "fisico";
  }

  function modificadoresDeStatus() {
    let reduzAtk = 0;
    let reduzDef = 0;
    let pulaTurno = false;
    state.statusEfeitos.forEach((efeito) => {
      const def = STATUS_EFFECT_TABLE[efeito.tipo];
      if (!def) return;
      reduzAtk += def.reduzAtk;
      reduzDef += def.reduzDef;
      if (def.pulaTurno) pulaTurno = true;
    });
    return { reduzAtk, reduzDef, pulaTurno };
  }

  function aplicarStatus(tipo, duracao) {
    const existente = state.statusEfeitos.find((s) => s.tipo === tipo);
    if (existente) existente.duracao = Math.max(existente.duracao, duracao);
    else state.statusEfeitos.push({ tipo, duracao });
  }

  function processarTickDeStatus() {
    let danoTotal = 0;
    state.statusEfeitos.forEach((efeito) => {
      const def = STATUS_EFFECT_TABLE[efeito.tipo];
      if (def && def.danoPorTurno > 0) {
        const dano = Math.max(1, Math.floor(state.hpMax * def.danoPorTurno));
        danoTotal += dano;
        adicionarLog(`Você sofre ${dano} de dano por ${def.nome}.`);
      }
      efeito.duracao -= 1;
    });
    state.statusEfeitos = state.statusEfeitos.filter((e) => e.duracao > 0);
    if (danoTotal > 0) {
      state.hp = Math.max(0, state.hp - danoTotal);
    }
  }

  function comandoMover(direcao) {
    if (battle || duel) {
      adicionarLog("Você está ocupado em combate.");
      return;
    }
    const deltas = { cima: [0, -1], baixo: [0, 1], esquerda: [-1, 0], direita: [1, 0] };
    const delta = deltas[direcao];
    if (!delta) {
      adicionarLog(`Direção inválida: ${direcao}`);
      return;
    }
    const novoX = state.x + delta[0];
    const novoY = state.y + delta[1];
    if (novoX < 0 || novoY < 0 || novoX >= CONFIG.GRID_SIZE || novoY >= CONFIG.GRID_SIZE) {
      adicionarLog("Você não pode ir além da borda do mapa.");
      return;
    }
    state.x = novoX;
    state.y = novoY;
    salvarProgressoDoAndar(state.andar);
    salvarEstado();
    desenharGrid();
    atualizarPainelStatus();
    propagarPosicao();
    verificarEventoDeSala();
  }

  function verificarEventoDeSala() {
    const sala = grid[state.y][state.x];
    if (sala.tipo === "monstro" && !sala.revelado) {
      const monstro = MONSTER_TABLE.find((m) => m.id === sala.monstroId);
      sala.revelado = true;
      iniciarBatalha(monstro, false);
    } else if (sala.tipo === "chefe" && !sala.revelado) {
      const boss = BOSS_TABLE.find((b) => b.id === sala.monstroId);
      sala.revelado = true;
      iniciarBatalha(boss, true);
    } else if (sala.tipo === "tesouro" && !sala.revelado) {
      sala.revelado = true;
      coletarTesouro();
    } else if (sala.tipo === "escada") {
      tentarDescerAndar();
    }
    salvarProgressoDoAndar(state.andar);
  }

  function tentarDescerAndar() {
    const chefeDoAndar = BOSS_TABLE.find((b) => b.andar === state.andar);
    const progresso = state.floorProgress[state.andar];
    const chefeCaiu = progresso ? verificarChefeDerrotadoNoProgresso(state.andar) : false;
    if (!chefeCaiu) {
      adicionarLog("A escada está bloqueada. Derrote o chefe deste andar primeiro.");
      return;
    }
    if (state.andar >= CONFIG.MAX_FLOOR) {
      adicionarLog("Você já está no andar mais profundo da masmorra.");
      return;
    }
    state.andar += 1;
    state.andarMaisAlto = Math.max(state.andarMaisAlto, state.andar);
    state.estatisticas.andaresVisitados = Math.max(state.estatisticas.andaresVisitados, state.andar);
    state.x = 2;
    state.y = 2;
    carregarProgressoDoAndar(state.andar);
    adicionarLog(`Você desceu para o andar ${state.andar}.`);
    propagarLog(`chegou ao andar ${state.andar}`);
    verificarConquistas();
    verificarQuestsPorAndar();
    salvarEstado();
    desenharGrid();
    atualizarPainelStatus();
    propagarPosicao();
  }

  function verificarChefeDerrotadoNoProgresso(andar) {
    const g = floorsCache[andar];
    if (!g) return false;
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        if (g[y][x].tipo === "chefe") return !!g[y][x].revelado;
      }
    }
    return false;
  }

  function coletarTesouro() {
    const itens = Object.keys(ITEM_TABLE).filter((id) => ITEM_TABLE[id].tipo !== "ouro");
    const escolhido = itens[Math.floor(Math.random() * itens.length)];
    const ganhoOuro = CONFIG.GOLD_BASE_DROP + Math.floor(Math.random() * 10) + state.andar * 2;
    adicionarItemInventario(escolhido, 1);
    adicionarOuro(ganhoOuro);
    state.estatisticas.tesourosColetados += 1;
    adicionarLog(`Você encontrou ${ITEM_TABLE[escolhido].nome} e ${ganhoOuro} de ouro!`);
    propagarLog("encontrou um tesouro");
    verificarQuestsPorTesouro();
    verificarConquistas();
    salvarEstado();
    atualizarPainelStatus();
    desenharGrid();
  }

  function adicionarItemInventario(itemId, qtd) {
    const existente = state.inventario.find((i) => i.id === itemId);
    if (existente) existente.qtd += qtd;
    else state.inventario.push({ id: itemId, qtd });
  }

  function adicionarEquipamento(itemId) {
    if (!state.itensEquip.includes(itemId)) state.itensEquip.push(itemId);
  }

  function adicionarOuro(qtd) {
    state.ouro += qtd;
    state.estatisticas.ouroTotalGanho += qtd;
  }

  function iniciarBatalha(monstroBase, ehChefe) {
    const hpMonstro = ehChefe ? monstroBase.hp : Math.floor(monstroBase.hpMin + Math.random() * (monstroBase.hpMax - monstroBase.hpMin));
    battle = {
      monstro: {
        id: monstroBase.id,
        nome: monstroBase.nome,
        hp: hpMonstro,
        hpMax: hpMonstro,
        atk: monstroBase.atk,
        def: monstroBase.def || 0,
        xp: monstroBase.xp,
        gold: monstroBase.gold || 0,
        elemento: monstroBase.elemento || "fisico",
        dropChance: monstroBase.dropChance || 0,
        drops: monstroBase.drops || [],
      },
      ehChefe,
      defendendo: false,
    };
    tocarSom(220, 0.15);
    adicionarLog(`⚔️ Um(a) ${battle.monstro.nome} apareceu!`);
    propagarLog(`entrou em combate com ${battle.monstro.nome}`);
    mostrarPainelDeAcao("batalha");
    atualizarPainelStatus();
  }

  function finalizarBatalha(vitoria) {
    if (!battle) return;
    const monstroId = battle.monstro.id;
    const ehChefe = battle.ehChefe;
    if (vitoria) {
      const xpGanho = battle.monstro.xp;
      const ouroGanho = battle.monstro.gold;
      adicionarLog(`Você derrotou ${battle.monstro.nome}! +${xpGanho} XP, +${ouroGanho} ouro`);
      propagarLog(`derrotou ${battle.monstro.nome}`);
      ganharExperiencia(xpGanho);
      adicionarOuro(ouroGanho);
      state.estatisticas.monstrosDerrotados += 1;
      if (ehChefe) state.estatisticas.chefesDerrotados += 1;

      if (battle.monstro.drops.length && Math.random() < battle.monstro.dropChance) {
        const escolhido = battle.monstro.drops[Math.floor(Math.random() * battle.monstro.drops.length)];
        if (EQUIPMENT_TABLE[escolhido]) {
          adicionarEquipamento(escolhido);
          adicionarLog(`Drop: ${EQUIPMENT_TABLE[escolhido].nome} (equipamento)`);
        } else if (ITEM_TABLE[escolhido]) {
          adicionarItemInventario(escolhido, 1);
          adicionarLog(`Drop: ${ITEM_TABLE[escolhido].nome}`);
        }
      }
      verificarQuestsPorMorte(monstroId, ehChefe);
      verificarConquistas();
    }
    battle = null;
    mostrarPainelDeAcao("nenhum");
    salvarEstado();
    atualizarPainelStatus();
    desenharGrid();
  }

  function ganharExperiencia(qtd) {
    state.xp += qtd;
    while (state.xp >= state.xpProximo) {
      state.xp -= state.xpProximo;
      state.nivel += 1;
      state.hpMax += 8;
      state.atkBase += 2;
      state.defBase += 1;
      state.hp = atributoTotal("hp");
      state.xpProximo = Math.floor(CONFIG.XP_BASE * Math.pow(CONFIG.XP_GROWTH, state.nivel - 1));
      tocarSom(440, 0.2);
      adicionarLog(`🎉 Você subiu para o nível ${state.nivel}!`);
    }
    verificarConquistas();
  }

  function calcularDano(atkBase, defAlvo, elementoAtacante, elementoDefensor) {
    let dano = Math.max(1, atkBase - defAlvo * 0.5);
    dano *= multiplicadorElemental(elementoAtacante, elementoDefensor);
    let critico = false;
    if (Math.random() < CONFIG.CRIT_CHANCE) {
      dano *= CONFIG.CRIT_MULT;
      critico = true;
    }
    dano += Math.floor(Math.random() * 3) - 1;
    return { dano: Math.max(1, Math.floor(dano)), critico };
  }

  function comandoAtacar() {
    if (!battle) {
      adicionarLog("Não há batalha em andamento.");
      return;
    }
    const mods = modificadoresDeStatus();
    if (mods.pulaTurno) {
      adicionarLog("Você está atordoado e não pode agir!");
      resolverTurnoMonstro();
      return;
    }
    const atkEfetivo = atributoTotal("atk") * (1 - mods.reduzAtk);
    const { dano, critico } = calcularDano(atkEfetivo, battle.monstro.def, elementoDoJogador(), battle.monstro.elemento);
    battle.monstro.hp -= dano;
    tocarSom(300, 0.1);
    adicionarLog(`Você atacou ${battle.monstro.nome} causando ${dano} de dano${critico ? " (CRÍTICO!)" : ""}.`);
    if (battle.monstro.hp <= 0) {
      finalizarBatalha(true);
      return;
    }
    resolverTurnoMonstro();
  }

  function comandoDefender() {
    if (!battle) {
      adicionarLog("Não há batalha em andamento.");
      return;
    }
    battle.defendendo = true;
    adicionarLog("Você se prepara para defender.");
    resolverTurnoMonstro();
  }

  function comandoFugir() {
    if (!battle) {
      adicionarLog("Não há batalha em andamento.");
      return;
    }
    const temPergaminho = state.inventario.find((i) => i.id === "pergaminho_fuga" && i.qtd > 0);
    const chanceFuga = temPergaminho ? 1 : CONFIG.FLEE_CHANCE;
    if (Math.random() < chanceFuga) {
      if (temPergaminho) {
        temPergaminho.qtd -= 1;
        state.inventario = state.inventario.filter((i) => i.qtd > 0);
      }
      adicionarLog("Você fugiu com sucesso!");
      propagarLog("fugiu de um combate");
      battle = null;
      mostrarPainelDeAcao("nenhum");
      atualizarPainelStatus();
      salvarEstado();
    } else {
      adicionarLog("A fuga falhou!");
      resolverTurnoMonstro();
    }
  }

  function comandoCurar() {
    const pocao = state.inventario.find((i) => i.id === "pocao_grande" && i.qtd > 0) || state.inventario.find((i) => i.id === "pocao_media" && i.qtd > 0) || state.inventario.find((i) => i.id === "pocao_pequena" && i.qtd > 0);
    if (!pocao) {
      adicionarLog("Você não tem poções no inventário.");
      return;
    }
    const cura = ITEM_TABLE[pocao.id].cura;
    state.hp = Math.min(atributoTotal("hp"), state.hp + cura);
    pocao.qtd -= 1;
    if (pocao.qtd <= 0) state.inventario = state.inventario.filter((i) => i.qtd > 0);
    adicionarLog(`Você usou ${ITEM_TABLE[pocao.id].nome} e recuperou ${cura} HP.`);
    salvarEstado();
    atualizarPainelStatus();
    if (battle) resolverTurnoMonstro();
  }

  function usarItemPorId(itemId) {
    const entrada = state.inventario.find((i) => i.id === itemId && i.qtd > 0);
    if (!entrada) {
      adicionarLog("Item não encontrado no inventário.");
      return;
    }
    const def = ITEM_TABLE[itemId];
    if (!def) return;
    if (def.tipo === "cura") {
      state.hp = Math.min(atributoTotal("hp"), state.hp + def.cura);
      adicionarLog(`Você usou ${def.nome} e recuperou ${def.cura} HP.`);
    } else if (def.tipo === "cura_status") {
      state.statusEfeitos = state.statusEfeitos.filter((s) => s.tipo !== def.removeStatus);
      adicionarLog(`Você usou ${def.nome} e removeu o status ${def.removeStatus}.`);
    } else if (def.tipo === "buff") {
      aplicarStatus(def.statusAplicado, def.duracao);
      adicionarLog(`Você usou ${def.nome}.`);
    } else if (def.tipo === "revive") {
      state.hp = Math.floor(atributoTotal("hp") * def.curaPercentual);
      adicionarLog(`Você usou ${def.nome} e restaurou completamente seu HP.`);
    } else if (def.tipo === "fuga_garantida") {
      adicionarLog(`${def.nome} guardado para a próxima fuga.`);
    } else if (def.tipo === "ouro") {
      adicionarOuro(def.ouro);
      adicionarLog(`Você usou ${def.nome} e ganhou ${def.ouro} de ouro.`);
    } else if (def.tipo === "ofensivo") {
      if (battle) {
        aplicarStatusNoMonstro(def.statusAplicado, def.duracao);
        adicionarLog(`Você usou ${def.nome} em ${battle.monstro.nome}.`);
      } else {
        adicionarLog(`${def.nome} só pode ser usado em combate.`);
        return;
      }
    }
    entrada.qtd -= 1;
    state.inventario = state.inventario.filter((i) => i.qtd > 0);
    salvarEstado();
    atualizarPainelStatus();
  }

  function aplicarStatusNoMonstro(tipo, duracao) {
    if (!battle) return;
    if (!battle.statusMonstro) battle.statusMonstro = [];
    const existente = battle.statusMonstro.find((s) => s.tipo === tipo);
    if (existente) existente.duracao = Math.max(existente.duracao, duracao);
    else battle.statusMonstro.push({ tipo, duracao });
  }

  function resolverTurnoMonstro() {
    if (!battle) return;
    processarTickDeStatus();
    if (state.hp <= 0) {
      resolverDerrota();
      return;
    }
    let statusMonstroDano = 0;
    if (battle.statusMonstro) {
      battle.statusMonstro.forEach((efeito) => {
        const def = STATUS_EFFECT_TABLE[efeito.tipo];
        if (def && def.danoPorTurno > 0) {
          const dano = Math.max(1, Math.floor(battle.monstro.hpMax * def.danoPorTurno));
          statusMonstroDano += dano;
        }
        efeito.duracao -= 1;
      });
      battle.statusMonstro = battle.statusMonstro.filter((e) => e.duracao > 0);
    }
    if (statusMonstroDano > 0) {
      battle.monstro.hp -= statusMonstroDano;
      adicionarLog(`${battle.monstro.nome} sofre ${statusMonstroDano} de dano contínuo.`);
      if (battle.monstro.hp <= 0) {
        finalizarBatalha(true);
        return;
      }
    }

    const pulaTurnoMonstro = battle.statusMonstro && battle.statusMonstro.some((e) => STATUS_EFFECT_TABLE[e.tipo] && STATUS_EFFECT_TABLE[e.tipo].pulaTurno);
    if (pulaTurnoMonstro) {
      adicionarLog(`${battle.monstro.nome} está atordoado e não ataca.`);
      atualizarPainelStatus();
      return;
    }

    let dano = Math.max(1, battle.monstro.atk - atributoTotal("def") * 0.5 + Math.floor(Math.random() * 2));
    if (battle.defendendo) {
      dano = Math.floor(dano * 0.4);
      battle.defendendo = false;
    }
    state.hp -= dano;
    adicionarLog(`${battle.monstro.nome} atacou você causando ${dano} de dano.`);
    if (state.hp <= 0) resolverDerrota();
    atualizarPainelStatus();
    salvarEstado();
  }

  function resolverDerrota() {
    state.hp = 0;
    adicionarLog("Você foi derrotado! Recuperando em segurança...");
    propagarLog("foi derrotado em combate");
    battle = null;
    mostrarPainelDeAcao("nenhum");
    state.hp = Math.floor(atributoTotal("hp") / 2);
    salvarEstado();
    atualizarPainelStatus();
  }

  function comandoStatus() {
    adicionarLog(`Nível ${state.nivel} | HP ${state.hp}/${atributoTotal("hp")} | XP ${state.xp}/${state.xpProximo} | Andar ${state.andar} | Ouro ${state.ouro}`);
  }

  function equiparItem(itemId) {
    if (!state.itensEquip.includes(itemId)) {
      adicionarLog("Você não possui esse equipamento.");
      return;
    }
    const item = EQUIPMENT_TABLE[itemId];
    if (!item) return;
    state.equipado[item.slot] = itemId;
    state.hp = Math.min(state.hp, atributoTotal("hp"));
    adicionarLog(`${item.nome} equipado.`);
    salvarEstado();
    atualizarPainelStatus();
    renderizarAbaAtiva();
  }

  function desequiparSlot(slot) {
    if (!state.equipado[slot]) return;
    adicionarLog(`Equipamento removido do slot ${slot}.`);
    state.equipado[slot] = null;
    salvarEstado();
    atualizarPainelStatus();
    renderizarAbaAtiva();
  }

  function comprarItem(itemId) {
    const itemLoja = ITEM_TABLE[itemId] || EQUIPMENT_TABLE[itemId];
    if (!itemLoja) {
      adicionarLog("Item não encontrado na loja.");
      return;
    }
    if (state.ouro < itemLoja.preco) {
      adicionarLog("Ouro insuficiente.");
      return;
    }
    state.ouro -= itemLoja.preco;
    if (ITEM_TABLE[itemId]) adicionarItemInventario(itemId, 1);
    else adicionarEquipamento(itemId);
    adicionarLog(`Você comprou ${itemLoja.nome}.`);
    salvarEstado();
    atualizarPainelStatus();
    renderizarAbaAtiva();
  }

  function venderEquipamento(itemId) {
    const idx = state.itensEquip.indexOf(itemId);
    if (idx === -1) {
      adicionarLog("Você não possui esse item para vender.");
      return;
    }
    const item = EQUIPMENT_TABLE[itemId];
    const valor = Math.floor((item.preco || 0) * 0.4);
    state.itensEquip.splice(idx, 1);
    if (state.equipado.arma === itemId) state.equipado.arma = null;
    if (state.equipado.armadura === itemId) state.equipado.armadura = null;
    if (state.equipado.acessorio === itemId) state.equipado.acessorio = null;
    adicionarOuro(valor);
    adicionarLog(`Você vendeu ${item.nome} por ${valor} de ouro.`);
    salvarEstado();
    atualizarPainelStatus();
    renderizarAbaAtiva();
  }

  function aceitarMissao(questId) {
    const def = QUEST_TABLE.find((q) => q.id === questId);
    if (!def) {
      adicionarLog("Missão inválida.");
      return;
    }
    if (state.quests.ativas.some((q) => q.id === questId) || state.quests.concluidas.includes(questId)) {
      adicionarLog("Você já aceitou ou concluiu essa missão.");
      return;
    }
    state.quests.ativas.push({ id: questId, progresso: 0 });
    adicionarLog(`Missão aceita: ${def.nome}`);
    salvarEstado();
    renderizarAbaAtiva();
  }

  function verificarQuestsPorMorte(monstroId, ehChefe) {
    state.quests.ativas.forEach((ativa) => {
      const def = QUEST_TABLE.find((q) => q.id === ativa.id);
      if (!def) return;
      if (def.tipo === "matar" && def.alvo === monstroId) ativa.progresso += 1;
      if (def.tipo === "chefe" && ehChefe && def.alvo === monstroId) ativa.progresso += 1;
    });
    finalizarQuestsCompletas();
  }

  function verificarQuestsPorTesouro() {
    state.quests.ativas.forEach((ativa) => {
      const def = QUEST_TABLE.find((q) => q.id === ativa.id);
      if (def && def.tipo === "tesouro") ativa.progresso += 1;
    });
    finalizarQuestsCompletas();
  }

  function verificarQuestsPorAndar() {
    state.quests.ativas.forEach((ativa) => {
      const def = QUEST_TABLE.find((q) => q.id === ativa.id);
      if (def && def.tipo === "andar" && state.andar >= def.quantidade) ativa.progresso = def.quantidade;
    });
    finalizarQuestsCompletas();
  }

  function finalizarQuestsCompletas() {
    const completas = state.quests.ativas.filter((ativa) => {
      const def = QUEST_TABLE.find((q) => q.id === ativa.id);
      return def && ativa.progresso >= def.quantidade;
    });
    completas.forEach((ativa) => {
      const def = QUEST_TABLE.find((q) => q.id === ativa.id);
      ganharExperiencia(def.xp);
      adicionarOuro(def.ouro);
      if (def.item) adicionarItemInventario(def.item, 1);
      state.quests.concluidas.push(def.id);
      adicionarLog(`✅ Missão concluída: ${def.nome} (+${def.xp} XP, +${def.ouro} ouro)`);
      propagarLog(`concluiu a missão ${def.nome}`);
    });
    if (completas.length) {
      state.quests.ativas = state.quests.ativas.filter((a) => !completas.some((c) => c.id === a.id));
      verificarConquistas();
      salvarEstado();
      renderizarAbaAtiva();
    }
  }

  function verificarConquistas() {
    ACHIEVEMENT_TABLE.forEach((conquista) => {
      if (state.conquistas.includes(conquista.id)) return;
      let valorAtual = 0;
      switch (conquista.tipo) {
        case "monstrosDerrotados": valorAtual = state.estatisticas.monstrosDerrotados; break;
        case "nivel": valorAtual = state.nivel; break;
        case "andar": valorAtual = state.andarMaisAlto; break;
        case "ouro": valorAtual = state.estatisticas.ouroTotalGanho; break;
        case "missoes": valorAtual = state.quests.concluidas.length; break;
        case "chefesDerrotados": valorAtual = state.estatisticas.chefesDerrotados; break;
        case "duelosVencidos": valorAtual = state.estatisticas.duelosVencidos; break;
        default: valorAtual = 0;
      }
      if (valorAtual >= conquista.meta) {
        state.conquistas.push(conquista.id);
        adicionarOuro(conquista.ouro);
        tocarSom(600, 0.25);
        adicionarLog(`🏆 Conquista desbloqueada: ${conquista.nome} (+${conquista.ouro} ouro)`);
        propagarLog(`desbloqueou a conquista ${conquista.nome}`);
      }
    });
  }

  function iniciarDesafioDuelo(nomeAlvo) {
    if (battle || duel) {
      adicionarLog("Você não pode duelar agora.");
      return;
    }
    if (!remotePlayers[nomeAlvo]) {
      adicionarLog("Jogador não encontrado nas proximidades.");
      return;
    }
    duel = { oponente: nomeAlvo, papel: "desafiante", status: "aguardando", hpOponente: null, meuHp: state.hp, inicio: Date.now() };
    enviarComandoRPG(`duelo_desafio`);
    adicionarLog(`Desafio de duelo enviado para ${nomeAlvo}.`);
  }

  function receberDesafioDuelo(remetente) {
    if (battle || duel) {
      enviarComandoRPG(`duelo_recusa`);
      return;
    }
    duel = { oponente: remetente, papel: "desafiado", status: "recebido", hpOponente: null, meuHp: state.hp, inicio: Date.now() };
    adicionarLog(`${remetente} desafiou você para um duelo! Use "aceitar duelo" ou "recusar duelo".`);
    mostrarPainelDeAcao("duelo_convite");
  }

  function aceitarDuelo() {
    if (!duel || duel.papel !== "desafiado") return;
    duel.status = "ativo";
    enviarComandoRPG(`duelo_aceite`);
    adicionarLog(`Duelo contra ${duel.oponente} iniciado!`);
    mostrarPainelDeAcao("duelo");
  }

  function recusarDuelo() {
    if (!duel) return;
    enviarComandoRPG(`duelo_recusa`);
    adicionarLog("Duelo recusado.");
    duel = null;
    mostrarPainelDeAcao("nenhum");
  }

  function receberAceiteDuelo(remetente) {
    if (!duel || duel.oponente !== remetente || duel.papel !== "desafiante") return;
    duel.status = "ativo";
    adicionarLog(`${remetente} aceitou o duelo!`);
    mostrarPainelDeAcao("duelo");
  }

  function comandoAtacarDuelo() {
    if (!duel || duel.status !== "ativo") {
      adicionarLog("Nenhum duelo ativo.");
      return;
    }
    const { dano, critico } = calcularDano(atributoTotal("atk"), 0, elementoDoJogador(), "fisico");
    enviarComandoRPG(`duelo_acao atacar ${dano}`);
    adicionarLog(`Você atacou ${duel.oponente} causando ${dano} de dano${critico ? " (CRÍTICO!)" : ""} no duelo.`);
  }

  function receberAcaoDuelo(remetente, texto) {
    if (!duel || duel.oponente !== remetente) return;
    const partes = texto.split(" ");
    if (partes[0] === "atacar") {
      const dano = parseInt(partes[1], 10) || 0;
      state.hp = Math.max(0, state.hp - dano);
      adicionarLog(`${remetente} atacou você causando ${dano} de dano no duelo.`);
      atualizarPainelStatus();
      if (state.hp <= 0) {
        adicionarLog(`Você perdeu o duelo contra ${remetente}.`);
        state.estatisticas.duelosPerdidos += 1;
        state.hp = Math.floor(atributoTotal("hp") / 2);
        duel = null;
        mostrarPainelDeAcao("nenhum");
        salvarEstado();
      } else if (partes[2] === "fim") {
        adicionarLog(`Você venceu o duelo contra ${remetente}!`);
        state.estatisticas.duelosVencidos += 1;
        verificarConquistas();
        duel = null;
        mostrarPainelDeAcao("nenhum");
        salvarEstado();
      }
    }
  }

  function despacharComando(comandoTexto) {
    const partes = comandoTexto.trim().split(/\s+/);
    const acao = partes[0];
    switch (acao) {
      case "mover":
        comandoMover(partes[1]);
        break;
      case "atacar":
        if (duel) comandoAtacarDuelo();
        else comandoAtacar();
        break;
      case "defender":
        comandoDefender();
        break;
      case "fugir":
        comandoFugir();
        break;
      case "curar":
        comandoCurar();
        break;
      case "status":
        comandoStatus();
        break;
      case "usar":
        usarItemPorId(partes[1]);
        break;
      case "equipar":
        equiparItem(partes[1]);
        break;
      case "desequipar":
        desequiparSlot(partes[1]);
        break;
      case "comprar":
        comprarItem(partes[1]);
        break;
      case "vender":
        venderEquipamento(partes[1]);
        break;
      case "missao":
        aceitarMissao(partes[1]);
        break;
      case "duelo":
        iniciarDesafioDuelo(partes[1]);
        break;
      case "aceitar":
        if (partes[1] === "duelo") aceitarDuelo();
        break;
      case "recusar":
        if (partes[1] === "duelo") recusarDuelo();
        break;
      case "ajuda":
        mostrarAjuda();
        break;
      default:
        adicionarLog(`Comando desconhecido: ${acao}. Digite "ajuda" para ver os comandos.`);
    }
  }

  function mostrarAjuda() {
    adicionarLog("Comandos: mover, atacar, defender, fugir, curar, status, usar, equipar, desequipar, comprar, vender, missao, duelo, aceitar duelo, recusar duelo.");
  }

  const CORES = { vazio: "#2b2b3a", monstro: "#7a2b2b", tesouro: "#c8a233", chefe: "#8a1fbf", escada: "#1f9c8a", jogador: "#2ecc71", outro: "#3498db", oculto: "#3a3a4a" };

  function tocarSom(freq, duracao) {
    if (!state || !state.config || !state.config.somAtivo) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duracao);
    } catch (e) {}
  }

  function construirUI() {
    const container = document.createElement("div");
    container.id = "rpg-overlay-container";
    container.style.cssText = "position:fixed;top:80px;left:20px;width:300px;background:#16161f;border:1px solid #333;border-radius:8px;font-family:Verdana,Tahoma,sans-serif;font-size:11px;color:#eee;z-index:999999;box-shadow:0 4px 18px rgba(0,0,0,0.5);user-select:none;";

    container.innerHTML = `
      <div id="rpg-titlebar" style="cursor:move;background:linear-gradient(90deg,#3a1f5d,#1f2a5d);padding:6px 8px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;font-weight:bold;">
        <span>⚔️ RPG Overlay</span>
        <span id="rpg-minimize-btn" style="cursor:pointer;padding:0 4px;">➖</span>
      </div>
      <div id="rpg-body" style="padding:8px;">
        <div id="rpg-tabs" style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;"></div>
        <div id="rpg-tab-content" style="min-height:120px;"></div>
        <div id="rpg-battle-buttons" style="display:none;gap:4px;margin:6px 0;flex-wrap:wrap;"></div>
        <div id="rpg-log" style="background:#101018;border-radius:4px;padding:6px;height:70px;overflow-y:auto;font-size:10px;line-height:1.4;margin-top:6px;"></div>
        <div id="rpg-controls" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;"></div>
      </div>
    `;

    document.body.appendChild(container);

    uiRefs.container = container;
    uiRefs.body = container.querySelector("#rpg-body");
    uiRefs.tabs = container.querySelector("#rpg-tabs");
    uiRefs.tabContent = container.querySelector("#rpg-tab-content");
    uiRefs.battleButtons = container.querySelector("#rpg-battle-buttons");
    uiRefs.logEl = container.querySelector("#rpg-log");
    uiRefs.controls = container.querySelector("#rpg-controls");
    uiRefs.minimizeBtn = container.querySelector("#rpg-minimize-btn");
    uiRefs.titlebar = container.querySelector("#rpg-titlebar");

    construirAbas();
    construirBotoesDeMovimento();
    construirBotoesDeBatalha();
    habilitarArrastar(uiRefs.titlebar, container);
    habilitarMinimizar();
    renderizarAbaAtiva();
  }

  const ABAS = [
    { id: "status", label: "Status" },
    { id: "mapa", label: "Mapa" },
    { id: "inventario", label: "Itens" },
    { id: "equipamento", label: "Equip" },
    { id: "missoes", label: "Missões" },
    { id: "conquistas", label: "Conq." },
    { id: "loja", label: "Loja" },
    { id: "ranking", label: "Ranking" },
    { id: "ajustes", label: "Ajustes" },
  ];

  function construirAbas() {
    ABAS.forEach((aba) => {
      const btn = document.createElement("button");
      btn.textContent = aba.label;
      btn.dataset.aba = aba.id;
      estilizarBotaoAba(btn, aba.id === abaAtiva);
      btn.addEventListener("click", () => {
        abaAtiva = aba.id;
        Array.from(uiRefs.tabs.children).forEach((el) => estilizarBotaoAba(el, el.dataset.aba === abaAtiva));
        renderizarAbaAtiva();
      });
      uiRefs.tabs.appendChild(btn);
    });
  }

  function estilizarBotaoAba(btn, ativo) {
    btn.style.cssText = `flex:1 1 auto;background:${ativo ? "#3a3a6a" : "#20202e"};border:1px solid #35354a;color:#eee;border-radius:3px;padding:3px 4px;cursor:pointer;font-size:9px;`;
  }

  function renderizarAbaAtiva() {
    if (!uiRefs.tabContent) return;
    switch (abaAtiva) {
      case "status": renderizarAbaStatus(); break;
      case "mapa": renderizarAbaMapa(); break;
      case "inventario": renderizarAbaInventario(); break;
      case "equipamento": renderizarAbaEquipamento(); break;
      case "missoes": renderizarAbaMissoes(); break;
      case "conquistas": renderizarAbaConquistas(); break;
      case "loja": renderizarAbaLoja(); break;
      case "ranking": renderizarAbaRanking(); break;
      case "ajustes": renderizarAbaAjustes(); break;
      default: uiRefs.tabContent.innerHTML = "";
    }
  }

  function renderizarAbaStatus() {
    let html = `
      <div style="background:#1f1f2b;border-radius:4px;padding:6px;line-height:1.6;">
        <strong>${escaparHtml(state.nome)}</strong><br/>
        Nível: ${state.nivel} &nbsp; Andar: ${state.andar}/${CONFIG.MAX_FLOOR}<br/>
        HP: ${state.hp}/${atributoTotal("hp")}<br/>
        ATK: ${atributoTotal("atk")} &nbsp; DEF: ${atributoTotal("def")}<br/>
        XP: ${state.xp}/${state.xpProximo}<br/>
        Ouro: ${state.ouro}<br/>
        Posição: (${state.x},${state.y})
      </div>`;
    if (state.statusEfeitos.length) {
      html += `<div style="margin-top:4px;">${state.statusEfeitos.map((s) => STATUS_EFFECT_TABLE[s.tipo] ? STATUS_EFFECT_TABLE[s.tipo].nome + " (" + s.duracao + ")" : "").join(", ")}</div>`;
    }
    if (battle) {
      html += `<div style="margin-top:4px;color:#e74c3c;">${escaparHtml(battle.monstro.nome)} — HP ${battle.monstro.hp}/${battle.monstro.hpMax}</div>`;
    }
    if (duel) {
      html += `<div style="margin-top:4px;color:#f39c12;">Duelo vs ${escaparHtml(duel.oponente)} (${duel.status})</div>`;
    }
    uiRefs.tabContent.innerHTML = html;
  }

  function renderizarAbaMapa() {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:grid;grid-template-columns:repeat(" + CONFIG.GRID_SIZE + ",1fr);gap:3px;";
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        const sala = grid[y][x];
        const celula = document.createElement("div");
        celula.style.cssText = `aspect-ratio:1;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;cursor:pointer;background:${obterCorDaCelula(sala, x, y)};border:${x === state.x && y === state.y ? "2px solid #fff" : "1px solid #222"};`;
        celula.title = descreverCelula(sala);
        celula.addEventListener("click", () => moverParaCelulaClicada(x, y));
        wrapper.appendChild(celula);
      }
    }
    uiRefs.tabContent.innerHTML = "";
    uiRefs.tabContent.appendChild(wrapper);
  }

  function desenharGrid() {
    if (abaAtiva === "mapa") renderizarAbaMapa();
  }

  function obterCorDaCelula(sala, x, y) {
    if (x === state.x && y === state.y) return CORES.jogador;
    const outroAqui = Object.values(remotePlayers).some((p) => p.x === x && p.y === y && p.andar === state.andar);
    if (outroAqui) return CORES.outro;
    if (!sala.revelado && (sala.tipo === "monstro" || sala.tipo === "chefe" || sala.tipo === "tesouro")) return CORES.oculto;
    return CORES[sala.tipo] || CORES.vazio;
  }

  function descreverCelula(sala) {
    if (!sala.revelado) return "???";
    switch (sala.tipo) {
      case "monstro": return "Sala de monstro (resolvida)";
      case "chefe": return "Sala de chefe";
      case "tesouro": return "Tesouro coletado";
      case "escada": return "Escada para o próximo andar";
      default: return "Sala vazia";
    }
  }

  function moverParaCelulaClicada(x, y) {
    const dx = x - state.x;
    const dy = y - state.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      adicionarLog("Só é possível mover para uma sala adjacente.");
      return;
    }
    if (dx === 1) despacharComando("mover direita");
    else if (dx === -1) despacharComando("mover esquerda");
    else if (dy === 1) despacharComando("mover baixo");
    else if (dy === -1) despacharComando("mover cima");
  }

  function renderizarAbaInventario() {
    if (!state.inventario.length) {
      uiRefs.tabContent.innerHTML = "<div>Inventário vazio.</div>";
      return;
    }
    const linhas = state.inventario.map((entrada) => {
      const def = ITEM_TABLE[entrada.id];
      if (!def) return "";
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #26263a;">
        <span>${escaparHtml(def.nome)} x${entrada.qtd}</span>
        <button data-usar="${entrada.id}" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">Usar</button>
      </div>`;
    });
    uiRefs.tabContent.innerHTML = linhas.join("");
    uiRefs.tabContent.querySelectorAll("[data-usar]").forEach((btn) => {
      btn.addEventListener("click", () => usarItemPorId(btn.dataset.usar));
    });
  }

  function renderizarAbaEquipamento() {
    let html = `<div style="margin-bottom:6px;">
      Arma: ${state.equipado.arma ? escaparHtml(EQUIPMENT_TABLE[state.equipado.arma].nome) : "nenhuma"}<br/>
      Armadura: ${state.equipado.armadura ? escaparHtml(EQUIPMENT_TABLE[state.equipado.armadura].nome) : "nenhuma"}<br/>
      Acessório: ${state.equipado.acessorio ? escaparHtml(EQUIPMENT_TABLE[state.equipado.acessorio].nome) : "nenhum"}
    </div>`;
    if (!state.itensEquip.length) {
      html += "<div>Você não possui equipamentos.</div>";
    } else {
      html += state.itensEquip.map((id) => {
        const item = EQUIPMENT_TABLE[id];
        if (!item) return "";
        const equipado = state.equipado[item.slot] === id;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #26263a;">
          <span>${escaparHtml(item.nome)} (${item.slot})</span>
          <span>
            <button data-equipar="${id}" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">${equipado ? "Remover" : "Equipar"}</button>
            <button data-vender="${id}" style="background:#3a2424;border:1px solid #553a3a;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">Vender</button>
          </span>
        </div>`;
      }).join("");
    }
    uiRefs.tabContent.innerHTML = html;
    uiRefs.tabContent.querySelectorAll("[data-equipar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.equipar;
        const item = EQUIPMENT_TABLE[id];
        if (state.equipado[item.slot] === id) desequiparSlot(item.slot);
        else equiparItem(id);
      });
    });
    uiRefs.tabContent.querySelectorAll("[data-vender]").forEach((btn) => {
      btn.addEventListener("click", () => venderEquipamento(btn.dataset.vender));
    });
  }

  function renderizarAbaMissoes() {
    let html = "<div><strong>Ativas</strong></div>";
    if (!state.quests.ativas.length) html += "<div>Nenhuma missão ativa.</div>";
    else {
      html += state.quests.ativas.map((ativa) => {
        const def = QUEST_TABLE.find((q) => q.id === ativa.id);
        if (!def) return "";
        return `<div style="padding:3px 0;border-bottom:1px solid #26263a;">${escaparHtml(def.nome)}: ${ativa.progresso}/${def.quantidade}</div>`;
      }).join("");
    }
    html += "<div style='margin-top:6px;'><strong>Disponíveis</strong></div>";
    const disponiveis = QUEST_TABLE.filter((q) => !state.quests.ativas.some((a) => a.id === q.id) && !state.quests.concluidas.includes(q.id));
    if (!disponiveis.length) html += "<div>Nenhuma missão disponível.</div>";
    else {
      html += disponiveis.map((q) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #26263a;">
        <span>${escaparHtml(q.nome)}</span>
        <button data-missao="${q.id}" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">Aceitar</button>
      </div>`).join("");
    }
    uiRefs.tabContent.innerHTML = html;
    uiRefs.tabContent.querySelectorAll("[data-missao]").forEach((btn) => {
      btn.addEventListener("click", () => aceitarMissao(btn.dataset.missao));
    });
  }

  function renderizarAbaConquistas() {
    const html = ACHIEVEMENT_TABLE.map((c) => {
      const desbloqueada = state.conquistas.includes(c.id);
      return `<div style="padding:3px 0;border-bottom:1px solid #26263a;opacity:${desbloqueada ? "1" : "0.4"};">
        ${desbloqueada ? "🏆" : "🔒"} ${escaparHtml(c.nome)} — ${escaparHtml(c.descricao)}
      </div>`;
    }).join("");
    uiRefs.tabContent.innerHTML = html;
  }

  function renderizarAbaLoja() {
    let html = `<div style="margin-bottom:4px;">Seu ouro: ${state.ouro}</div><div><strong>Consumíveis</strong></div>`;
    html += Object.keys(ITEM_TABLE).filter((id) => ITEM_TABLE[id].preco > 0).map((id) => {
      const item = ITEM_TABLE[id];
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #26263a;">
        <span>${escaparHtml(item.nome)} (${item.preco}g)</span>
        <button data-comprar="${id}" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">Comprar</button>
      </div>`;
    }).join("");
    html += `<div style="margin:6px 0 4px;"><strong>Equipamentos</strong></div>`;
    html += Object.keys(EQUIPMENT_TABLE).map((id) => {
      const item = EQUIPMENT_TABLE[id];
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid #26263a;">
        <span>${escaparHtml(item.nome)} (${item.preco}g)</span>
        <button data-comprar="${id}" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 5px;cursor:pointer;font-size:9px;">Comprar</button>
      </div>`;
    }).join("");
    uiRefs.tabContent.innerHTML = html;
    uiRefs.tabContent.querySelectorAll("[data-comprar]").forEach((btn) => {
      btn.addEventListener("click", () => comprarItem(btn.dataset.comprar));
    });
  }

  function renderizarAbaRanking() {
    const entradas = Object.keys(remotePlayers).map((nome) => ({ nome, nivel: remotePlayers[nome].nivel, andar: remotePlayers[nome].andar }));
    entradas.push({ nome: state.nome + " (você)", nivel: state.nivel, andar: state.andar });
    entradas.sort((a, b) => b.nivel - a.nivel);
    uiRefs.tabContent.innerHTML = entradas.map((e) => `<div style="padding:3px 0;border-bottom:1px solid #26263a;">${escaparHtml(e.nome)} — Nível ${e.nivel} — Andar ${e.andar}</div>`).join("") || "<div>Nenhum jogador próximo detectado ainda.</div>";
  }

  function renderizarAbaAjustes() {
    uiRefs.tabContent.innerHTML = `
      <div style="padding:3px 0;display:flex;justify-content:space-between;align-items:center;">
        <span>Som</span>
        <button id="rpg-toggle-som" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:9px;">${state.config.somAtivo ? "Ligado" : "Desligado"}</button>
      </div>
      <div style="padding:3px 0;display:flex;justify-content:space-between;align-items:center;">
        <span>Debug</span>
        <button id="rpg-toggle-debug" style="background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:9px;">${CONFIG.DEBUG ? "Ligado" : "Desligado"}</button>
      </div>
      <div style="padding:6px 0;">
        <button id="rpg-resetar" style="background:#3a2424;border:1px solid #553a3a;color:#eee;border-radius:3px;padding:4px 8px;cursor:pointer;font-size:10px;width:100%;">Resetar Progresso</button>
      </div>
    `;
    uiRefs.tabContent.querySelector("#rpg-toggle-som").addEventListener("click", () => {
      state.config.somAtivo = !state.config.somAtivo;
      salvarEstado();
      renderizarAbaAjustes();
    });
    uiRefs.tabContent.querySelector("#rpg-toggle-debug").addEventListener("click", () => {
      CONFIG.DEBUG = !CONFIG.DEBUG;
      renderizarAbaAjustes();
    });
    uiRefs.tabContent.querySelector("#rpg-resetar").addEventListener("click", () => {
      if (!confirm("Tem certeza que deseja resetar todo o progresso?")) return;
      sessionStorage.removeItem(CONFIG.STORAGE_KEY);
      state = defaultState();
      floorsCache = {};
      carregarProgressoDoAndar(state.andar);
      salvarEstado();
      atualizarPainelStatus();
      renderizarAbaAtiva();
      adicionarLog("Progresso resetado.");
    });
  }

  function construirBotoesDeMovimento() {
    const botoes = [
      { label: "⬆️", dir: "cima" },
      { label: "⬅️", dir: "esquerda" },
      { label: "➡️", dir: "direita" },
      { label: "⬇️", dir: "baixo" },
      { label: "📊", acao: "status" },
      { label: "🧪", acao: "curar" },
    ];
    botoes.forEach((b) => {
      const btn = document.createElement("button");
      btn.textContent = b.label;
      estilizarBotao(btn);
      btn.addEventListener("click", () => {
        if (b.dir) despacharComando(`mover ${b.dir}`);
        else despacharComando(b.acao);
      });
      uiRefs.controls.appendChild(btn);
    });
  }

  function construirBotoesDeBatalha() {
    const acoes = [
      { label: "Atacar", acao: "atacar" },
      { label: "Defender", acao: "defender" },
      { label: "Fugir", acao: "fugir" },
      { label: "Curar", acao: "curar" },
    ];
    acoes.forEach((a) => {
      const btn = document.createElement("button");
      btn.textContent = a.label;
      btn.dataset.acaoBatalha = a.acao;
      estilizarBotao(btn);
      btn.style.flex = "1 1 45%";
      btn.addEventListener("click", () => despacharComando(a.acao));
      uiRefs.battleButtons.appendChild(btn);
    });

    const btnAceitar = document.createElement("button");
    btnAceitar.textContent = "Aceitar Duelo";
    btnAceitar.dataset.acaoBatalha = "aceitar_duelo";
    estilizarBotao(btnAceitar);
    btnAceitar.style.flex = "1 1 45%";
    btnAceitar.addEventListener("click", aceitarDuelo);
    uiRefs.battleButtons.appendChild(btnAceitar);

    const btnRecusar = document.createElement("button");
    btnRecusar.textContent = "Recusar Duelo";
    btnRecusar.dataset.acaoBatalha = "recusar_duelo";
    estilizarBotao(btnRecusar);
    btnRecusar.style.flex = "1 1 45%";
    btnRecusar.addEventListener("click", recusarDuelo);
    uiRefs.battleButtons.appendChild(btnRecusar);
  }

  function mostrarPainelDeAcao(modo) {
    if (!uiRefs.battleButtons) return;
    Array.from(uiRefs.battleButtons.children).forEach((btn) => {
      const acao = btn.dataset.acaoBatalha;
      let visivel = false;
      if (modo === "batalha") visivel = ["atacar", "defender", "fugir", "curar"].includes(acao);
      else if (modo === "duelo") visivel = acao === "atacar" || acao === "defender";
      else if (modo === "duelo_convite") visivel = acao === "aceitar_duelo" || acao === "recusar_duelo";
      btn.style.display = visivel ? "inline-block" : "none";
    });
    uiRefs.battleButtons.style.display = modo === "nenhum" ? "none" : "flex";
  }

  function estilizarBotao(btn) {
    btn.style.cssText = "background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:4px;padding:4px 2px;cursor:pointer;font-size:11px;";
    btn.addEventListener("mouseenter", () => (btn.style.background = "#33335a"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#24243a"));
  }

  function habilitarArrastar(handle, alvo) {
    let arrastando = false;
    let offsetX = 0;
    let offsetY = 0;
    handle.addEventListener("mousedown", (e) => {
      arrastando = true;
      const rect = alvo.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });
    document.addEventListener("mousemove", (e) => {
      if (!arrastando) return;
      alvo.style.left = `${e.clientX - offsetX}px`;
      alvo.style.top = `${e.clientY - offsetY}px`;
    });
    document.addEventListener("mouseup", () => { arrastando = false; });
  }

  function habilitarMinimizar() {
    let minimizado = false;
    uiRefs.minimizeBtn.addEventListener("click", () => {
      minimizado = !minimizado;
      uiRefs.body.style.display = minimizado ? "none" : "block";
      uiRefs.minimizeBtn.textContent = minimizado ? "➕" : "➖";
    });
  }

  function removerUI() {
    if (uiRefs.container && uiRefs.container.parentNode) uiRefs.container.parentNode.removeChild(uiRefs.container);
    uiRefs = {};
  }

  function atualizarPainelStatus() {
    if (abaAtiva === "status") renderizarAbaStatus();
  }

  const logBuffer = [];
  function adicionarLog(mensagem) {
    logBuffer.push(mensagem);
    while (logBuffer.length > 6) logBuffer.shift();
    if (uiRefs.logEl) {
      uiRefs.logEl.innerHTML = logBuffer.map((l) => `<div>${escaparHtml(l)}</div>`).join("");
      uiRefs.logEl.scrollTop = uiRefs.logEl.scrollHeight;
    }
    log(mensagem);
  }

  function escaparHtml(str) {
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
  }

  function tentarIntegrarComLens() {
    if (window._lens && typeof window._lens.on === "function") {
      try {
        window._lens.on("chat", (evento) => {
          const texto = evento && (evento.mensagem || evento.text);
          const remetente = evento && (evento.remetente || evento.sender);
          if (typeof texto === "string") processarLinhaDeChat(remetente || "desconhecido", texto);
        });
        return true;
      } catch (e) {
        warn("falha integração _lens", e);
      }
    }
    return false;
  }

  let limpezaChunksTimer = null;

  function init(opts) {
    opts = opts || {};
    if (typeof opts.debug === "boolean") CONFIG.DEBUG = opts.debug;

    state = carregarEstado();
    floorsCache = {};
    remotePlayers = {};
    battle = null;
    duel = null;
    abaAtiva = "status";

    carregarProgressoDoAndar(state.andar);

    construirUI();
    atualizarPainelStatus();
    adicionarLog("RPG Overlay iniciado. Digite 'ajuda' para ver os comandos.");

    const integradoComLens = tentarIntegrarComLens();
    if (!integradoComLens) instalarHooks();

    iniciarProcessadorDeFila();
    limpezaChunksTimer = setInterval(limparChunksExpirados, CONFIG.CHUNK_TIMEOUT_MS);
    propagarPosicao();

    log("RPG Overlay inicializado", state);
  }

  function kill() {
    salvarProgressoDoAndar(state ? state.andar : 1);
    salvarEstado();
    desinstalarHooks();
    pararProcessadorDeFila();
    if (limpezaChunksTimer) clearInterval(limpezaChunksTimer);
    limpezaChunksTimer = null;
    removerUI();
    state = null;
    grid = null;
    floorsCache = {};
    remotePlayers = {};
    battle = null;
    duel = null;
    chunkBuffers = {};
    log("RPG Overlay finalizado");
  }

  window._rpg = {
    __loaded: true,
    init,
    kill,
    _debug: {
      getState: () => state,
      getGrid: () => grid,
      setDebug: (v) => (CONFIG.DEBUG = !!v),
      despachar: (cmd) => despacharComando(cmd),
      irParaAndar: (n) => {
        state.andar = n;
        carregarProgressoDoAndar(n);
        desenharGrid();
      },
    },
  };

  window._rpg.init();

})();
