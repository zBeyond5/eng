(function () {
  "use strict";

  if (window._rpg && window._rpg.__loaded) return;

  const CONFIG = {
    PREFIX: "/rpg ",
    STORAGE_KEY: "_rpg_state_v3",
    GRID_SIZE: 5,
    DEBUG: false,
    HEADERS: { CHAT_NORMAL: 1146, CHAT_SHOUT: 25, CHAT_OUTBOUND: 1678, CHAT_ACTION: 890 },
    TICK_MS: 200,
    FLEE_CHANCE: 0.5,
    XP_BASE: 50,
    XP_GROWTH: 1.32,
    MAX_FLOOR: 6,
    CRIT_CHANCE: 0.12,
    CRIT_MULT: 1.8,
    GOLD_BASE_DROP: 4,
  };

  function log(...args) { if (CONFIG.DEBUG) console.log("[RPG]", ...args); }
  function warn(...args) { if (CONFIG.DEBUG) console.warn("[RPG]", ...args); }

  const RpgCodec = {
    encode(str) {
      const bytes = new TextEncoder().encode(str);
      let binary = "";
      bytes.forEach(b => binary += String.fromCharCode(b));
      return btoa(binary);
    },
    decode(b64) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      } catch (e) { return null; }
    }
  };

  const ELEMENTOS = ["fisico", "fogo", "gelo", "veneno", "sombra", "luz"];
  const MATRIZ_ELEMENTAL = {
    fisico: { forte: "sombra", fraco: "luz" },
    fogo: { forte: "gelo", fraco: "veneno" },
    gelo: { forte: "fogo", fraco: "fisico" },
    veneno: { forte: "luz", fraco: "fogo" },
    sombra: { forte: "luz", fraco: "fisico" },
    luz: { forte: "sombra", fraco: "veneno" }
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
    { id: "goblin", nome: "Goblin Arruaceiro", andar: 2, hpMin: 18, hpMax: 26, atk: 4, def: 1, xp: 26, gold: 8, elemento: "fisico", dropChance: 0.35, drops: ["pocao_media", "adaga_ferro"] },
    { id: "orc", nome: "Orc Selvagem", andar: 2, hpMin: 24, hpMax: 32, atk: 5, def: 2, xp: 32, gold: 10, elemento: "fisico", dropChance: 0.35, drops: ["pocao_media", "escudo_madeira"] },
    { id: "kobold", nome: "Kobold Ladino", andar: 2, hpMin: 16, hpMax: 22, atk: 4, def: 1, xp: 24, gold: 9, elemento: "sombra", dropChance: 0.3, drops: ["pocao_media"] },
    { id: "esqueleto", nome: "Esqueleto Errante", andar: 3, hpMin: 26, hpMax: 34, atk: 6, def: 3, xp: 40, gold: 14, elemento: "sombra", dropChance: 0.38, drops: ["pocao_media", "espada_osso"] },
    { id: "zumbi", nome: "Zumbi Apodrecido", andar: 3, hpMin: 30, hpMax: 40, atk: 5, def: 4, xp: 42, gold: 14, elemento: "veneno", dropChance: 0.36, drops: ["antidoto", "armadura_couro"] },
    { id: "ogro", nome: "Ogro Faminto", andar: 3, hpMin: 36, hpMax: 46, atk: 8, def: 3, xp: 50, gold: 18, elemento: "fisico", dropChance: 0.4, drops: ["pocao_grande", "clava_ogro"] },
    { id: "minotauro", nome: "Minotauro Jovem", andar: 4, hpMin: 40, hpMax: 52, atk: 9, def: 4, xp: 60, gold: 22, elemento: "fisico", dropChance: 0.42, drops: ["pocao_grande", "machado_duplo"] },
    { id: "necromante", nome: "Necromante Aprendiz", andar: 4, hpMin: 34, hpMax: 44, atk: 10, def: 2, xp: 58, gold: 23, elemento: "sombra", dropChance: 0.4, drops: ["cajado_ossos", "pocao_grande"] },
    { id: "wyvern", nome: "Wyvern Jovem", andar: 5, hpMin: 52, hpMax: 66, atk: 12, def: 6, xp: 80, gold: 30, elemento: "gelo", dropChance: 0.44, drops: ["pocao_grande", "lanca_wyvern"] },
    { id: "cavaleironegro", nome: "Cavaleiro Negro", andar: 6, hpMin: 70, hpMax: 88, atk: 16, def: 10, xp: 120, gold: 45, elemento: "sombra", dropChance: 0.48, drops: ["espada_negra", "pocao_grande"] },
    { id: "demoniomenor", nome: "Demônio Menor", andar: 6, hpMin: 68, hpMax: 84, atk: 17, def: 8, xp: 128, gold: 47, elemento: "sombra", dropChance: 0.47, drops: ["pocao_grande", "elixir_forca"] }
  ];

  const BOSS_TABLE = [
    { id: "rei_ratos", nome: "Rei dos Ratos", andar: 1, hp: 70, atk: 6, def: 2, xp: 100, gold: 30, elemento: "fisico", drops: ["pocao_grande", "adaga_ferro"] },
    { id: "rei_goblin", nome: "Rei Goblin", andar: 2, hp: 110, atk: 9, def: 4, xp: 160, gold: 45, elemento: "fisico", drops: ["escudo_ferro", "pocao_grande"] },
    { id: "senhor_esqueletos", nome: "Senhor dos Esqueletos", andar: 3, hp: 150, atk: 12, def: 5, xp: 220, gold: 60, elemento: "sombra", drops: ["espada_osso", "manto_sombrio"] },
    { id: "matriarca_hidra", nome: "Matriarca da Hidra", andar: 4, hp: 200, atk: 15, def: 8, xp: 300, gold: 80, elemento: "gelo", drops: ["lanca_wyvern", "pocao_grande"] },
    { id: "arconte_caido", nome: "Arconte Caído", andar: 5, hp: 260, atk: 19, def: 10, xp: 400, gold: 100, elemento: "sombra", drops: ["amuleto_sombra", "elixir_forca"] },
    { id: "dragao_ancestral", nome: "Dragão Ancestral", andar: 6, hp: 360, atk: 24, def: 14, xp: 600, gold: 150, elemento: "fogo", drops: ["espada_negra", "pena_fenix", "armadura_granito"] }
  ];

  const ITEM_TABLE = {
    pocao_pequena: { nome: "Poção de Cura Pequena", tipo: "cura", cura: 15, preco: 10 },
    pocao_media: { nome: "Poção de Cura Média", tipo: "cura", cura: 35, preco: 25 },
    pocao_grande: { nome: "Poção de Cura Grande", tipo: "cura", cura: 65, preco: 50 },
    antidoto: { nome: "Antídoto", tipo: "cura_status", removeStatus: "veneno", preco: 15 },
    elixir_forca: { nome: "Elixir da Força", tipo: "buff", statusAplicado: "fortalecimento", duracao: 3, preco: 60 },
    veneno_extrato: { nome: "Extrato Venenoso", tipo: "ofensivo", statusAplicado: "veneno", duracao: 3, preco: 35 },
    pena_fenix: { nome: "Pena de Fênix", tipo: "revive", curaPercentual: 1, preco: 200 },
    pergaminho_fuga: { nome: "Pergaminho de Fuga", tipo: "fuga_garantida", preco: 45 }
  };

  const EQUIPMENT_TABLE = {
    adaga_ferro: { nome: "Adaga de Ferro", slot: "arma", atk: 3, def: 0, hp: 0, elemento: "fisico", preco: 40 },
    espada_osso: { nome: "Espada de Osso", slot: "arma", atk: 6, def: 0, hp: 0, elemento: "sombra", preco: 90 },
    clava_ogro: { nome: "Clava de Ogro", slot: "arma", atk: 8, def: -1, hp: 10, elemento: "fisico", preco: 130 },
    machado_duplo: { nome: "Machado Duplo", slot: "arma", atk: 11, def: 0, hp: 0, elemento: "fisico", preco: 190 },
    cajado_ossos: { nome: "Cajado de Ossos", slot: "arma", atk: 9, def: 0, hp: 5, elemento: "sombra", preco: 200 },
    lanca_wyvern: { nome: "Lança de Wyvern", slot: "arma", atk: 13, def: 1, hp: 0, elemento: "gelo", preco: 260 },
    espada_negra: { nome: "Espada Negra", slot: "arma", atk: 19, def: 2, hp: -10, elemento: "sombra", preco: 420 },
    escudo_madeira: { nome: "Escudo de Madeira", slot: "armadura", atk: 0, def: 3, hp: 5, elemento: "fisico", preco: 35 },
    armadura_couro: { nome: "Armadura de Couro", slot: "armadura", atk: 0, def: 5, hp: 10, elemento: "fisico", preco: 80 },
    escudo_ferro: { nome: "Escudo de Ferro", slot: "armadura", atk: 0, def: 8, hp: 15, elemento: "fisico", preco: 150 },
    manto_sombrio: { nome: "Manto Sombrio", slot: "armadura", atk: 1, def: 6, hp: 12, elemento: "sombra", preco: 170 },
    armadura_granito: { nome: "Armadura de Granito", slot: "armadura", atk: -2, def: 20, hp: 50, elemento: "fisico", preco: 400 },
    amuleto_vento: { nome: "Amuleto do Vento", slot: "acessorio", atk: 2, def: 1, hp: 5, elemento: "gelo", preco: 60 },
    amuleto_sombra: { nome: "Amuleto Sombrio", slot: "acessorio", atk: 4, def: 2, hp: 10, elemento: "sombra", preco: 220 },
    bracelete_forca: { nome: "Bracelete da Força", slot: "acessorio", atk: 5, def: 0, hp: 0, elemento: "fisico", preco: 160 }
  };

  const STATUS_EFFECT_TABLE = {
    veneno: { nome: "Envenenado", danoPorTurno: 0.08, reduzAtk: 0, reduzDef: 0, pulaTurno: false },
    atordoamento: { nome: "Atordoado", danoPorTurno: 0, reduzAtk: 0, reduzDef: 0, pulaTurno: true },
    fortalecimento: { nome: "Fortalecido", danoPorTurno: 0, reduzAtk: -0.3, reduzDef: 0, pulaTurno: false }
  };

  let state, grid, remotePlayers = {}, battle = null, duel = null, queue = [], queueTimer = null, ui = {}, actionLock = false;
  let abaAtiva = "status", audioCtx = null;

  function defaultState() {
    return {
      nome: obterNomeJogador(),
      nivel: 1, hp: 30, hpMax: 30, atkBase: 5, defBase: 2,
      xp: 0, xpProximo: CONFIG.XP_BASE, ouro: 0,
      andar: 1, andarMaisAlto: 1, x: 2, y: 2,
      seedBase: gerarSeedPadrao(),
      inventario: [{ id: "pocao_pequena", qtd: 3 }],
      itensEquip: [],
      equipado: { arma: null, armadura: null, acessorio: null },
      statusEfeitos: [],
      floorProgress: {},
      monstrosDerrotados: 0, chefesDerrotados: 0, tesourosColetados: 0
    };
  }

  function gerarSeedPadrao() {
    try { return window.location.href.split('?')[0].split('/').pop() || "padrao"; } catch (e) { return "padrao"; }
  }

  function obterNomeJogador() {
    try {
      if (window.HabboClientController && window.HabboClientController.userName) return window.HabboClientController.userName;
    } catch (e) {}
    return "Jogador" + Math.floor(Math.random() * 9999);
  }

  function salvarEstado() {
    try { sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function carregarEstado() {
    try {
      const raw = sessionStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.nivel === "number") {
          const base = defaultState();
          const mesclado = Object.assign({}, base, parsed);
          mesclado.equipado = Object.assign({}, base.equipado, parsed.equipado || {});
          return mesclado;
        }
      }
    } catch (e) {}
    return defaultState();
  }

  function rngFromSeed(seed) {
    let a = seed;
    return function() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gerarGrid(andar) {
    const seed = (state.seedBase.charCodeAt(0) || 123) + andar * 7919;
    const rand = rngFromSeed(seed);
    const g = [];
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      g.push([]);
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) g[y].push({ tipo: "vazio", monstroId: null, revelado: false });
    }
    const centro = Math.floor(CONFIG.GRID_SIZE / 2);
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        if (x === centro && y === centro) continue;
        const r = rand();
        if (r < 0.28) {
          g[y][x].tipo = "monstro";
          const pool = MONSTER_TABLE.filter(m => m.andar === andar);
          g[y][x].monstroId = (pool.length ? pool : MONSTER_TABLE)[Math.floor(rand() * pool.length || 0)].id;
        } else if (r < 0.42) {
          g[y][x].tipo = "tesouro";
        }
      }
    }
    const cantos = [[0,0],[0,CONFIG.GRID_SIZE-1],[CONFIG.GRID_SIZE-1,0],[CONFIG.GRID_SIZE-1,CONFIG.GRID_SIZE-1]];
    const bossCanto = cantos[Math.floor(rand() * cantos.length)];
    const boss = BOSS_TABLE.find(b => b.andar === andar) || BOSS_TABLE[0];
    g[bossCanto[1]][bossCanto[0]] = { tipo: "chefe", monstroId: boss.id, revelado: false };
    const resto = cantos.filter(c => c[0] !== bossCanto[0] || c[1] !== bossCanto[1]);
    const escada = resto[Math.floor(rand() * resto.length)];
    g[escada[1]][escada[0]] = { tipo: "escada", monstroId: null, revelado: false };
    return g;
  }

  function carregarProgressoDoAndar(andar) {
    grid = gerarGrid(andar);
    const salvo = state.floorProgress[andar];
    if (salvo) {
      for (let y = 0; y < CONFIG.GRID_SIZE; y++)
        for (let x = 0; x < CONFIG.GRID_SIZE; x++)
          grid[y][x].revelado = salvo[y] && salvo[y][x];
    }
  }

  function salvarProgressoDoAndar(andar) {
    state.floorProgress[andar] = grid.map(l => l.map(c => c.revelado));
  }

  function atributoTotal(nome) {
    let val = nome === "atk" ? state.atkBase : nome === "def" ? state.defBase : state.hpMax;
    ["arma", "armadura", "acessorio"].forEach(slot => {
      const id = state.equipado[slot];
      if (id && EQUIPMENT_TABLE[id]) {
        if (nome === "atk") val += EQUIPMENT_TABLE[id].atk || 0;
        if (nome === "def") val += EQUIPMENT_TABLE[id].def || 0;
        if (nome === "hp") val += EQUIPMENT_TABLE[id].hp || 0;
      }
    });
    return Math.max(1, val);
  }

  function elementoJogador() {
    const arma = state.equipado.arma;
    return arma && EQUIPMENT_TABLE[arma] ? EQUIPMENT_TABLE[arma].elemento : "fisico";
  }

  function processarStatusEfeitos() {
    let dano = 0;
    state.statusEfeitos.forEach(ef => {
      const def = STATUS_EFFECT_TABLE[ef.tipo];
      if (def && def.danoPorTurno > 0) dano += Math.max(1, Math.floor(state.hpMax * def.danoPorTurno));
      ef.duracao--;
    });
    state.statusEfeitos = state.statusEfeitos.filter(e => e.duracao > 0);
    if (dano > 0) state.hp = Math.max(0, state.hp - dano);
  }

  function modsStatus() {
    let redAtk = 0, redDef = 0, pula = false;
    state.statusEfeitos.forEach(ef => {
      const d = STATUS_EFFECT_TABLE[ef.tipo];
      if (d) { redAtk += d.reduzAtk; redDef += d.reduzDef; if (d.pulaTurno) pula = true; }
    });
    return { redAtk, redDef, pula };
  }

  function enviarComandoRPG(cmd) {
    const payload = RpgCodec.encode(cmd);
    const linha = CONFIG.PREFIX + payload;
    const campo = document.querySelector("#chat-input") || document.querySelector('input[name="chat"]') || document.querySelector(".chat-input textarea");
    if (campo) {
      const prev = campo.value;
      campo.value = linha;
      campo.dispatchEvent(new Event("input", { bubbles: true }));
      campo.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      campo.value = prev;
    }
  }

  function propagarPosicao() { enviarComandoRPG(`pos ${state.x} ${state.y} ${state.nivel} ${state.andar}`); }
  function propagarLog(msg) { enviarComandoRPG(`log ${msg}`); }

  function processarMensagemChat(texto) {
    if (!texto || !texto.startsWith(CONFIG.PREFIX)) return;
    const b64 = texto.slice(CONFIG.PREFIX.length).trim();
    if (!b64) return;
    const dec = RpgCodec.decode(b64);
    if (!dec) return;
    queue.push(dec);
  }

  function iniciarFila() {
    if (queueTimer) return;
    queueTimer = setInterval(() => {
      if (queue.length === 0) return;
      const cmd = queue.shift();
      const partes = cmd.split(" ");
      switch (partes[0]) {
        case "pos":
          remotePlayers[partes[3] || "desconhecido"] = { x: +partes[1], y: +partes[2], nivel: +partes[3] || 1, andar: +partes[4] || 1 };
          if (abaAtiva === "mapa") desenharGrid();
          break;
        case "log":
          adicionarLog(`[${partes[1] || "??"}] ${partes.slice(2).join(" ")}`);
          break;
        case "duelo_desafio":
          receberDesafioDuelo(partes[1]);
          break;
        case "duelo_aceite":
          if (duel && duel.oponente === partes[1]) { duel.status = "ativo"; adicionarLog("Duelo aceito!"); mostrarPainel("duelo"); }
          break;
        case "duelo_recusa":
          if (duel && duel.oponente === partes[1]) { adicionarLog("Duelo recusado."); duel = null; mostrarPainel("nenhum"); }
          break;
        case "duelo_acao":
          if (duel && duel.oponente === partes[1]) receberAcaoDuelo(partes.slice(2).join(" "));
          break;
      }
    }, CONFIG.TICK_MS);
  }

  function instalarHookChat() {
    if (!window._hubSocket || typeof window._hubSocket.onMessage !== "function") return;
    window._hubSocket.onMessage((evento, ws) => {
      const data = evento.data;
      if (!(data instanceof ArrayBuffer) || data.byteLength < 6) return;
      const view = new DataView(data);
      const header = view.getUint16(4, false);
      if (header === CONFIG.HEADERS.CHAT_NORMAL || header === CONFIG.HEADERS.CHAT_SHOUT || header === CONFIG.HEADERS.CHAT_ACTION) {
        let offset = 6;
        if (header === CONFIG.HEADERS.CHAT_ACTION) offset += 2;
        const virtualId = view.getUint16(offset, false); offset += 2;
        const msgLen = view.getUint16(offset, false); offset += 2;
        if (msgLen > 0 && msgLen <= 4096 && offset + msgLen <= data.byteLength) {
          const msgBytes = new Uint8Array(data, offset, msgLen);
          const msg = new TextDecoder().decode(msgBytes).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
          if (msg.startsWith(CONFIG.PREFIX)) processarMensagemChat(msg);
        }
      } else if (header === CONFIG.HEADERS.CHAT_OUTBOUND) {
        const msgLen = view.getUint16(6, false);
        if (msgLen > 0 && 8 + msgLen <= data.byteLength) {
          const msgBytes = new Uint8Array(data, 8, msgLen);
          const msg = new TextDecoder().decode(msgBytes).replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
          if (msg.startsWith(CONFIG.PREFIX)) processarMensagemChat(msg);
        }
      }
    });
  }

  function adicionarLog(msg) {
    if (!ui.logEl) return;
    const linha = document.createElement("div");
    linha.textContent = msg;
    ui.logEl.appendChild(linha);
    if (ui.logEl.children.length > 6) ui.logEl.removeChild(ui.logEl.firstChild);
    ui.logEl.scrollTop = ui.logEl.scrollHeight;
  }

  function despacharComando(cmd) {
    if (actionLock) { adicionarLog("Aguarde seu turno."); return; }
    actionLock = true;
    setTimeout(() => { actionLock = false; }, CONFIG.TICK_MS);
    const partes = cmd.trim().split(/\s+/);
    switch (partes[0]) {
      case "mover": comandoMover(partes[1]); break;
      case "atacar": if (duel) comandoAtacarDuelo(); else comandoAtacar(); break;
      case "defender": comandoDefender(); break;
      case "fugir": comandoFugir(); break;
      case "curar": comandoCurar(); break;
      case "status": adicionarLog(`Nível ${state.nivel} HP ${state.hp}/${atributoTotal("hp")} XP ${state.xp}/${state.xpProximo} Andar ${state.andar} Ouro ${state.ouro}`); break;
      case "usar": usarItem(partes[1]); break;
      case "equipar": equipar(partes[1]); break;
      case "comprar": comprar(partes[1]); break;
      case "duelo": iniciarDuelo(partes[1]); break;
      case "aceitar": if (partes[1] === "duelo") aceitarDuelo(); break;
      case "recusar": if (partes[1] === "duelo") recusarDuelo(); break;
    }
  }

  function comandoMover(dir) {
    if (battle || duel) return adicionarLog("Em combate.");
    const d = { cima: [0, -1], baixo: [0, 1], esquerda: [-1, 0], direita: [1, 0] }[dir];
    if (!d) return adicionarLog("Direção inválida.");
    const nx = state.x + d[0], ny = state.y + d[1];
    if (nx < 0 || ny < 0 || nx >= CONFIG.GRID_SIZE || ny >= CONFIG.GRID_SIZE) return adicionarLog("Fora do mapa.");
    state.x = nx; state.y = ny;
    salvarProgressoDoAndar(state.andar); salvarEstado();
    desenharGrid(); atualizarStatus(); propagarPosicao();
    verificarEventoSala();
  }

  function verificarEventoSala() {
    const sala = grid[state.y][state.x];
    if (!sala.revelado) {
      sala.revelado = true;
      if (sala.tipo === "monstro") iniciarBatalha(MONSTER_TABLE.find(m => m.id === sala.monstroId), false);
      else if (sala.tipo === "chefe") iniciarBatalha(BOSS_TABLE.find(b => b.id === sala.monstroId), true);
      else if (sala.tipo === "tesouro") coletarTesouro();
      else if (sala.tipo === "escada") tentarDescer();
    }
    salvarProgressoDoAndar(state.andar);
  }

  function tentarDescer() {
    const chefe = BOSS_TABLE.find(b => b.andar === state.andar);
    const venceu = grid.some(linha => linha.some(c => c.tipo === "chefe" && c.revelado));
    if (!venceu) return adicionarLog("Derrote o chefe primeiro.");
    if (state.andar >= CONFIG.MAX_FLOOR) return adicionarLog("Masmorra concluída.");
    state.andar++; state.andarMaisAlto = Math.max(state.andarMaisAlto, state.andar);
    state.x = 2; state.y = 2;
    carregarProgressoDoAndar(state.andar);
    adicionarLog(`Desceste ao andar ${state.andar}.`);
    salvarEstado(); desenharGrid(); atualizarStatus(); propagarPosicao();
  }

  function coletarTesouro() {
    const itens = Object.keys(ITEM_TABLE).filter(id => ITEM_TABLE[id].tipo !== "revive");
    const escolhido = itens[Math.floor(Math.random() * itens.length)];
    adicionarItem(escolhido, 1);
    state.ouro += CONFIG.GOLD_BASE_DROP + Math.floor(Math.random() * 10);
    state.tesourosColetados++;
    adicionarLog(`Tesouro: ${ITEM_TABLE[escolhido].nome} e ouro!`);
    salvarEstado(); atualizarStatus();
  }

  function adicionarItem(id, qtd) {
    const exist = state.inventario.find(i => i.id === id);
    if (exist) exist.qtd += qtd; else state.inventario.push({ id, qtd });
  }

  function iniciarBatalha(monstro, chefe) {
    const hp = chefe ? monstro.hp : Math.floor(monstro.hpMin + Math.random() * (monstro.hpMax - monstro.hpMin));
    battle = { monstro: { ...monstro, hp, hpMax: hp, def: monstro.def || 0 }, chefe };
    adicionarLog(`⚔️ ${monstro.nome} apareceu!`);
    mostrarPainel("batalha"); atualizarStatus();
  }

  function finalizarBatalha(vitoria) {
    if (!battle) return;
    if (vitoria) {
      const { xp, gold, nome, id } = battle.monstro;
      adicionarLog(`Vitória! +${xp} XP, +${gold} ouro`);
      state.xp += xp; state.ouro += gold; state.monstrosDerrotados++;
      if (battle.chefe) state.chefesDerrotados++;
      while (state.xp >= state.xpProximo) {
        state.xp -= state.xpProximo; state.nivel++;
        state.hpMax += 8; state.atkBase += 2; state.defBase += 1;
        state.xpProximo = Math.floor(CONFIG.XP_BASE * Math.pow(CONFIG.XP_GROWTH, state.nivel - 1));
        state.hp = atributoTotal("hp");
      }
      if (battle.monstro.drops && Math.random() < battle.monstro.dropChance) {
        const drop = battle.monstro.drops[Math.floor(Math.random() * battle.monstro.drops.length)];
        if (EQUIPMENT_TABLE[drop]) { state.itensEquip.push(drop); adicionarLog(`Drop: ${EQUIPMENT_TABLE[drop].nome}`); }
        else if (ITEM_TABLE[drop]) { adicionarItem(drop, 1); adicionarLog(`Drop: ${ITEM_TABLE[drop].nome}`); }
      }
    }
    battle = null; mostrarPainel("nenhum"); salvarEstado(); atualizarStatus(); desenharGrid();
  }

  function calcularDano(atk, def, elAtk, elDef) {
    let dano = Math.max(1, atk - def * 0.5);
    dano *= multiplicadorElemental(elAtk, elDef);
    let critico = Math.random() < CONFIG.CRIT_CHANCE;
    if (critico) dano *= CONFIG.CRIT_MULT;
    return { dano: Math.max(1, Math.floor(dano + (Math.random() * 2 - 1))), critico };
  }

  function comandoAtacar() {
    if (!battle) return adicionarLog("Sem batalha.");
    const mods = modsStatus();
    if (mods.pula) { adicionarLog("Atordoado!"); turnoMonstro(); return; }
    const atkEfetivo = atributoTotal("atk") * (1 - mods.redAtk);
    const { dano, critico } = calcularDano(atkEfetivo, battle.monstro.def, elementoJogador(), battle.monstro.elemento);
    battle.monstro.hp -= dano;
    adicionarLog(`Atacaste ${battle.monstro.nome} - ${dano} dano${critico ? " CRÍTICO!" : ""}.`);
    if (battle.monstro.hp <= 0) finalizarBatalha(true);
    else turnoMonstro();
  }

  function comandoDefender() { if (!battle) return; battle.defendendo = true; adicionarLog("Defendendo."); turnoMonstro(); }

  function comandoFugir() {
    if (!battle) return;
    const perg = state.inventario.find(i => i.id === "pergaminho_fuga" && i.qtd > 0);
    if (perg || Math.random() < CONFIG.FLEE_CHANCE) {
      if (perg) perg.qtd--;
      adicionarLog("Fugiste!"); battle = null; mostrarPainel("nenhum");
    } else { adicionarLog("Fuga falhou."); turnoMonstro(); }
    salvarEstado(); atualizarStatus();
  }

  function comandoCurar() {
    const poc = state.inventario.find(i => i.id.startsWith("pocao_") && i.qtd > 0);
    if (!poc) return adicionarLog("Sem poções.");
    const cura = ITEM_TABLE[poc.id].cura;
    state.hp = Math.min(atributoTotal("hp"), state.hp + cura);
    poc.qtd--; state.inventario = state.inventario.filter(i => i.qtd > 0);
    adicionarLog(`Curaste ${cura} HP.`);
    salvarEstado(); atualizarStatus();
    if (battle) turnoMonstro();
  }

  function turnoMonstro() {
    if (!battle) return;
    processarStatusEfeitos();
    if (state.hp <= 0) return derrota();
    const pula = battle.statusMonstro && battle.statusMonstro.some(e => STATUS_EFFECT_TABLE[e.tipo] && STATUS_EFFECT_TABLE[e.tipo].pulaTurno);
    if (pula) { adicionarLog(`${battle.monstro.nome} atordoado.`); atualizarStatus(); return; }
    let dano = Math.max(1, battle.monstro.atk - atributoTotal("def") * 0.5 + Math.floor(Math.random() * 2));
    if (battle.defendendo) { dano = Math.floor(dano * 0.4); battle.defendendo = false; }
    state.hp -= dano;
    adicionarLog(`${battle.monstro.nome} atacou - ${dano} dano.`);
    if (state.hp <= 0) derrota();
    atualizarStatus(); salvarEstado();
  }

  function derrota() {
    adicionarLog("Derrotado! Recuperando...");
    state.hp = Math.floor(atributoTotal("hp") * 0.3);
    battle = null; mostrarPainel("nenhum"); salvarEstado(); atualizarStatus();
  }

  function iniciarDuelo(alvo) {
    if (battle || duel) return adicionarLog("Ocupado.");
    if (!remotePlayers[alvo]) return adicionarLog("Jogador não encontrado.");
    duel = { oponente: alvo, status: "aguardando" };
    enviarComandoRPG(`duelo_desafio ${state.nome}`);
    adicionarLog(`Desafiaste ${alvo}.`);
  }

  function receberDesafioDuelo(desafiante) {
    if (battle || duel) { enviarComandoRPG(`duelo_recusa ${desafiante}`); return; }
    duel = { oponente: desafiante, status: "recebido" };
    adicionarLog(`${desafiante} te desafiou! Use aceitar duelo ou recusar duelo.`);
    mostrarPainel("duelo_convite");
  }

  function aceitarDuelo() { if (duel && duel.status === "recebido") { duel.status = "ativo"; enviarComandoRPG(`duelo_aceite ${duel.oponente}`); adicionarLog("Duelo iniciado!"); mostrarPainel("duelo"); } }
  function recusarDuelo() { if (duel) { enviarComandoRPG(`duelo_recusa ${duel.oponente}`); adicionarLog("Recusaste."); duel = null; mostrarPainel("nenhum"); } }

  function comandoAtacarDuelo() {
    if (!duel || duel.status !== "ativo") return;
    const { dano } = calcularDano(atributoTotal("atk"), 0, elementoJogador(), "fisico");
    enviarComandoRPG(`duelo_acao ${duel.oponente} atacar ${dano}`);
    adicionarLog(`Atacaste no duelo: ${dano} dano.`);
  }

  function receberAcaoDuelo(acao) {
    const partes = acao.split(" ");
    if (partes[0] === "atacar") {
      const dano = parseInt(partes[1]) || 0;
      state.hp = Math.max(0, state.hp - dano);
      adicionarLog(`${duel.oponente} te atacou: ${dano} dano.`);
      if (state.hp <= 0) { adicionarLog("Perdeste o duelo."); state.hp = Math.floor(atributoTotal("hp") * 0.3); duel = null; mostrarPainel("nenhum"); }
      atualizarStatus(); salvarEstado();
    }
  }

  function usarItem(id) {
    const entry = state.inventario.find(i => i.id === id && i.qtd > 0);
    if (!entry) return adicionarLog("Item não encontrado.");
    const def = ITEM_TABLE[id];
    if (def.tipo === "cura") { state.hp = Math.min(atributoTotal("hp"), state.hp + def.cura); adicionarLog(`Usaste ${def.nome}.`); }
    else if (def.tipo === "cura_status") { state.statusEfeitos = state.statusEfeitos.filter(e => e.tipo !== def.removeStatus); }
    else if (def.tipo === "buff") { state.statusEfeitos.push({ tipo: def.statusAplicado, duracao: def.duracao }); }
    entry.qtd--; state.inventario = state.inventario.filter(i => i.qtd > 0);
    salvarEstado(); atualizarStatus();
  }

  function equipar(id) {
    if (!state.itensEquip.includes(id)) return adicionarLog("Não possuis este equipamento.");
    const item = EQUIPMENT_TABLE[id];
    state.equipado[item.slot] = id;
    state.hp = Math.min(state.hp, atributoTotal("hp"));
    adicionarLog(`${item.nome} equipado.`);
    salvarEstado(); atualizarStatus(); renderizarAbaAtiva();
  }

  function comprar(id) {
    const item = ITEM_TABLE[id] || EQUIPMENT_TABLE[id];
    if (!item) return;
    if (state.ouro < item.preco) return adicionarLog("Ouro insuficiente.");
    state.ouro -= item.preco;
    if (ITEM_TABLE[id]) adicionarItem(id, 1);
    else state.itensEquip.push(id);
    adicionarLog(`Compraste ${item.nome}.`);
    salvarEstado(); atualizarStatus(); renderizarAbaAtiva();
  }

  function construirUI() {
    const container = document.createElement("div");
    container.id = "rpg-overlay";
    container.style.cssText = "position:fixed;top:80px;left:20px;width:300px;background:#16161f;border:1px solid #333;border-radius:8px;font-family:Verdana;font-size:11px;color:#eee;z-index:999999;box-shadow:0 4px 18px rgba(0,0,0,.5);";
    container.innerHTML = `
      <div id="rpg-title" style="cursor:move;background:linear-gradient(90deg,#3a1f5d,#1f2a5d);padding:6px 8px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;font-weight:bold;">
        <span>⚔️ RPG Overlay</span>
        <span id="rpg-min" style="cursor:pointer;">➖</span>
      </div>
      <div id="rpg-body" style="padding:8px;">
        <div id="rpg-tabs" style="display:flex;flex-wrap:wrap;gap:2px;margin-bottom:6px;"></div>
        <div id="rpg-content" style="min-height:120px;"></div>
        <div id="rpg-actions" style="display:none;gap:4px;margin:6px 0;"></div>
        <div id="rpg-log" style="background:#101018;border-radius:4px;padding:6px;height:70px;overflow-y:auto;font-size:10px;line-height:1.4;"></div>
        <div id="rpg-controls" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:6px;"></div>
      </div>
    `;
    document.body.appendChild(container);
    ui.container = container;
    ui.body = container.querySelector("#rpg-body");
    ui.tabs = container.querySelector("#rpg-tabs");
    ui.content = container.querySelector("#rpg-content");
    ui.actions = container.querySelector("#rpg-actions");
    ui.logEl = container.querySelector("#rpg-log");
    ui.controls = container.querySelector("#rpg-controls");
    ui.minBtn = container.querySelector("#rpg-min");
    ui.titlebar = container.querySelector("#rpg-title");

    ["status","mapa","inventario","equip","loja"].forEach(id => {
      const btn = document.createElement("button");
      btn.textContent = id.charAt(0).toUpperCase() + id.slice(1);
      btn.style.cssText = `flex:1 1 auto;background:#20202e;border:1px solid #35354a;color:#eee;border-radius:3px;padding:3px;cursor:pointer;font-size:9px;`;
      btn.onclick = () => { abaAtiva = id; renderizarAbaAtiva(); };
      ui.tabs.appendChild(btn);
    });

    ["⬆️","⬅️","➡️","⬇️","📊","🧪"].forEach((txt, i) => {
      const btn = document.createElement("button");
      btn.textContent = txt;
      btn.style.cssText = "background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:4px;padding:4px 2px;cursor:pointer;font-size:11px;";
      btn.onclick = () => {
        if (i < 4) despacharComando(`mover ${["cima","esquerda","direita","baixo"][i]}`);
        else if (i === 4) despacharComando("status");
        else despacharComando("curar");
      };
      ui.controls.appendChild(btn);
    });

    ["atacar","defender","fugir","curar"].forEach(a => {
      const btn = document.createElement("button");
      btn.textContent = a;
      btn.style.cssText = "flex:1 1 45%;background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:4px;padding:4px 2px;cursor:pointer;font-size:10px;";
      btn.onclick = () => despacharComando(a);
      btn.dataset.acao = a;
      ui.actions.appendChild(btn);
    });

    const aceitar = document.createElement("button"); aceitar.textContent = "Aceitar Duelo"; aceitar.dataset.acao = "aceitar_duelo"; aceitar.style.cssText = "flex:1 1 45%;background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:4px;padding:4px 2px;cursor:pointer;font-size:10px;"; aceitar.onclick = aceitarDuelo; ui.actions.appendChild(aceitar);
    const recusar = document.createElement("button"); recusar.textContent = "Recusar"; recusar.dataset.acao = "recusar_duelo"; recusar.style.cssText = "flex:1 1 45%;background:#24243a;border:1px solid #3a3a55;color:#eee;border-radius:4px;padding:4px 2px;cursor:pointer;font-size:10px;"; recusar.onclick = recusarDuelo; ui.actions.appendChild(recusar);

    let drag = false, ox, oy;
    ui.titlebar.onmousedown = e => { drag = true; ox = e.clientX - container.offsetLeft; oy = e.clientY - container.offsetTop; };
    document.onmousemove = e => { if (drag) { container.style.left = (e.clientX - ox) + "px"; container.style.top = (e.clientY - oy) + "px"; } };
    document.onmouseup = () => { drag = false; };

    ui.minBtn.onclick = () => { ui.body.style.display = ui.body.style.display === "none" ? "block" : "none"; ui.minBtn.textContent = ui.body.style.display === "none" ? "➕" : "➖"; };

    renderizarAbaAtiva();
  }

  function mostrarPainel(modo) {
    Array.from(ui.actions.children).forEach(btn => {
      const a = btn.dataset.acao;
      btn.style.display = (modo === "batalha" && a) || (modo === "duelo" && a === "atacar") || (modo === "duelo_convite" && (a === "aceitar_duelo" || a === "recusar_duelo")) ? "inline-block" : "none";
    });
    ui.actions.style.display = modo === "nenhum" ? "none" : "flex";
  }

  function renderizarAbaAtiva() {
    if (!ui.content) return;
    switch (abaAtiva) {
      case "status": ui.content.innerHTML = `<div style="background:#1f1f2b;padding:6px;border-radius:4px;">Nome: ${state.nome}<br>Nível: ${state.nivel} Andar: ${state.andar}<br>HP: ${state.hp}/${atributoTotal("hp")}<br>ATK: ${atributoTotal("atk")} DEF: ${atributoTotal("def")}<br>XP: ${state.xp}/${state.xpProximo} Ouro: ${state.ouro}<br>Pos: (${state.x},${state.y})</div>`; break;
      case "mapa": desenharGrid(); break;
      case "inventario": ui.content.innerHTML = state.inventario.map(i => `<div>${ITEM_TABLE[i.id]?.nome || i.id} x${i.qtd} <button data-usar="${i.id}">Usar</button></div>`).join("") || "Vazio"; ui.content.querySelectorAll("[data-usar]").forEach(b => b.onclick = () => usarItem(b.dataset.usar)); break;
      case "equip": ui.content.innerHTML = `<div>Arma: ${state.equipado.arma ? EQUIPMENT_TABLE[state.equipado.arma].nome : "nenhuma"}</div><div>Armadura: ${state.equipado.armadura ? EQUIPMENT_TABLE[state.equipado.armadura].nome : "nenhuma"}</div><div>Acessório: ${state.equipado.acessorio ? EQUIPMENT_TABLE[state.equipado.acessorio].nome : "nenhum"}</div>` + state.itensEquip.map(id => `<div>${EQUIPMENT_TABLE[id].nome} <button data-equip="${id}">Equipar</button></div>`).join(""); ui.content.querySelectorAll("[data-equip]").forEach(b => b.onclick = () => equipar(b.dataset.equip)); break;
      case "loja": ui.content.innerHTML = `<div>Ouro: ${state.ouro}</div>` + Object.keys(ITEM_TABLE).filter(id => ITEM_TABLE[id].preco > 0).map(id => `<div>${ITEM_TABLE[id].nome} (${ITEM_TABLE[id].preco}g) <button data-comprar="${id}">Comprar</button></div>`).join("") + Object.keys(EQUIPMENT_TABLE).map(id => `<div>${EQUIPMENT_TABLE[id].nome} (${EQUIPMENT_TABLE[id].preco}g) <button data-comprar="${id}">Comprar</button></div>`).join(""); ui.content.querySelectorAll("[data-comprar]").forEach(b => b.onclick = () => comprar(b.dataset.comprar)); break;
    }
  }

  function desenharGrid() {
    if (!ui.content) return;
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:grid;grid-template-columns:repeat(" + CONFIG.GRID_SIZE + ",1fr);gap:3px;";
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        const sala = grid[y][x];
        const div = document.createElement("div");
        div.style.cssText = `aspect-ratio:1;border-radius:3px;background:${corCelula(sala, x, y)};border:${x===state.x&&y===state.y?"2px solid #fff":"1px solid #222"};`;
        div.onclick = () => moverPara(x, y);
        wrapper.appendChild(div);
      }
    }
    ui.content.innerHTML = "";
    ui.content.appendChild(wrapper);
  }

  function corCelula(sala, x, y) {
    if (x === state.x && y === state.y) return "#2ecc71";
    if (Object.values(remotePlayers).some(p => p.x === x && p.y === y && p.andar === state.andar)) return "#3498db";
    if (!sala.revelado) return "#3a3a4a";
    return { vazio: "#2b2b3a", monstro: "#7a2b2b", tesouro: "#c8a233", chefe: "#8a1fbf", escada: "#1f9c8a" }[sala.tipo] || "#2b2b3a";
  }

  function moverPara(x, y) {
    if (Math.abs(x - state.x) + Math.abs(y - state.y) !== 1) return;
    const dir = x > state.x ? "direita" : x < state.x ? "esquerda" : y > state.y ? "baixo" : "cima";
    despacharComando(`mover ${dir}`);
  }

  function atualizarStatus() { if (abaAtiva === "status") renderizarAbaAtiva(); }

  function init() {
    if (ui.container) return;
    state = carregarEstado();
    carregarProgressoDoAndar(state.andar);
    construirUI();
    instalarHookChat();
    iniciarFila();
    adicionarLog("RPG Overlay pronto. Comandos: mover, atacar, defender, fugir, curar, status, duelo <nome>");
    propagarPosicao();
  }

  function kill() {
    salvarProgressoDoAndar(state.andar);
    salvarEstado();
    if (queueTimer) clearInterval(queueTimer);
    if (ui.container) ui.container.remove();
    state = null; grid = null; remotePlayers = {}; battle = null; duel = null; ui = {};
  }

  window._rpg = {
    __loaded: true,
    init,
    kill
  };

  // Auto-inicializa ao ser carregado pelo Hub (já que é ativado manualmente)
  setTimeout(init, 50);
})();
