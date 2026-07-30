(function () {
  "use strict";

  if (window._rpg && window._rpg.__loaded) {
    console.warn("[RPG Overlay] módulo já carregado, ignorando nova instância.");
    return;
  }

  const CONFIG = {
    PREFIX: "/rpg ",              // prefixo usado no chat para reconhecer pacotes RPG
    STORAGE_KEY: "_rpg_state_v1", // chave do sessionStorage
    GRID_SIZE: 5,                 // grid 5x5
    DEBUG: false,                 // modo debug desabilitado por padrão
    HEADERS: {
      CHAT_NORMAL: 1146,   // "diz"
      CHAT_SHOUT: 25,      // "grita"
      CHAT_WHISPER: 1678,  // "sussurra"
    },
    TICK_MS: 120,          // intervalo de processamento da fila de mensagens
    FLEE_CHANCE: 0.5,      // 50% de chance de fuga
    XP_BASE: 50,           // xp necessário para o nível 2
    XP_GROWTH: 1.35,       // fator de crescimento do xp necessário por nível
  };

  function log(...args) {
    if (CONFIG.DEBUG) console.log("[RPG]", ...args);
  }
  function warn(...args) {
    if (CONFIG.DEBUG) console.warn("[RPG]", ...args);
  }

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
        warn("falha ao decodificar payload base64:", b64, e);
        return null;
      }
    },
  };

  /* ------------------------------------------------------------------------
   * 4. TABELAS DE DADOS: MONSTROS E ITENS
   * --------------------------------------------------------------------- */
  const MONSTER_TABLE = [
    { id: "rato",      nome: "Rato do Esgoto",   hpMin: 8,  hpMax: 14, atk: 2, xp: 12, dropChance: 0.25 },
    { id: "aranha",    nome: "Aranha Peluda",    hpMin: 12, hpMax: 18, atk: 3, xp: 18, dropChance: 0.3  },
    { id: "goblin",    nome: "Goblin Arruaceiro",hpMin: 18, hpMax: 26, atk: 4, xp: 26, dropChance: 0.35 },
    { id: "esqueleto", nome: "Esqueleto Errante",hpMin: 24, hpMax: 32, atk: 5, xp: 34, dropChance: 0.4  },
    { id: "troll",     nome: "Troll de Pedra",   hpMin: 34, hpMax: 44, atk: 7, xp: 48, dropChance: 0.45 },
  ];

  const BOSS_TABLE = [
    { id: "rei_goblin", nome: "Rei Goblin",  hp: 80,  atk: 10, xp: 150, dropChance: 1.0 },
    { id: "dragao_novo", nome: "Dragão Jovem", hp: 120, atk: 14, xp: 260, dropChance: 1.0 },
  ];

  const ITEM_TABLE = {
    pocao_pequena: { nome: "Poção de Cura Pequena", cura: 15 },
    pocao_grande:  { nome: "Poção de Cura Grande",  cura: 35 },
  };

  /* ------------------------------------------------------------------------
   * 5. ESTADO DO JOGO (privado ao módulo — não vaza para window)
   * --------------------------------------------------------------------- */
  let state = null;          // estado do jogador local
  let grid = null;           // grid 5x5 compartilhado (reconstruído por seed)
  let remotePlayers = {};    // posições de outros jogadores: { nome: {x,y,nivel} }
  let messageQueue = [];     // fila de mensagens RPG recebidas, para processar em ordem
  let queueTimer = null;     // handle do setInterval da fila
  let battle = null;         // estado de batalha ativa (ou null)
  let uiRefs = {};           // referências aos elementos DOM da interface
  let hooksInstalled = false;
  let originalSocketSend = null;
  let originalSocketOnMessage = null;

  /* ------------------------------------------------------------------------
   * 6. PERSISTÊNCIA (sessionStorage)
   * --------------------------------------------------------------------- */
  function defaultState() {
    return {
      nome: obterNomeJogador(),
      nivel: 1,
      hp: 30,
      hpMax: 30,
      atk: 5,
      def: 2,
      xp: 0,
      xpProximo: CONFIG.XP_BASE,
      x: 2,
      y: 2,
      inventario: [{ id: "pocao_pequena", qtd: 2 }],
      seedGrid: gerarSeedPadrao(),
    };
  }

  function gerarSeedPadrao() {
    // Seed determinística por sala, para que todos os jogadores no mesmo
    // quarto gerem o mesmo layout de grid sem precisar trocar o mapa inteiro.
    const roomId = obterIdQuarto();
    let seed = 0;
    for (let i = 0; i < roomId.length; i++) {
      seed = (seed * 31 + roomId.charCodeAt(i)) >>> 0;
    }
    return seed || 12345;
  }

  function obterIdQuarto() {
    // Tenta obter o id do quarto atual a partir de estruturas comuns do
    // cliente Habbo/Habblive; cai em um valor fixo caso não encontre.
    try {
      if (window.HabboClientController && window.HabboClientController.roomId) {
        return String(window.HabboClientController.roomId);
      }
      if (window._lens && window._lens.roomId) {
        return String(window._lens.roomId);
      }
    } catch (e) {
      /* silencioso: apenas fallback abaixo */
    }
    return "quarto-padrao";
  }

  function obterNomeJogador() {
    try {
      if (window.HabboClientController && window.HabboClientController.userName) {
        return window.HabboClientController.userName;
      }
      if (window._lens && window._lens.userName) {
        return window._lens.userName;
      }
    } catch (e) {
      /* silencioso */
    }
    return "Jogador" + Math.floor(Math.random() * 9999);
  }

  function salvarEstado() {
    try {
      sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      warn("não foi possível salvar estado no sessionStorage:", e);
    }
  }

  function carregarEstado() {
    try {
      const raw = sessionStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // validação simples de forma
        if (parsed && typeof parsed.nivel === "number") {
          return parsed;
        }
      }
    } catch (e) {
      warn("estado salvo corrompido, recriando:", e);
    }
    return defaultState();
  }

  /* ------------------------------------------------------------------------
   * 7. GERADOR DE GRID (5x5) — determinístico via seed
   * --------------------------------------------------------------------- */
  function rngFromSeed(seed) {
    // PRNG simples (mulberry32) para gerar o mesmo grid a partir da seed.
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gerarGrid(seed) {
    const rand = rngFromSeed(seed);
    const tamanho = CONFIG.GRID_SIZE;
    const novoGrid = [];
    for (let y = 0; y < tamanho; y++) {
      const linha = [];
      for (let x = 0; x < tamanho; x++) {
        linha.push({ tipo: "vazio", monstroId: null, revelado: false });
      }
      novoGrid.push(linha);
    }

    // centro do grid é sempre o ponto de partida, mantém vazio
    const centro = Math.floor(tamanho / 2);

    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        if (x === centro && y === centro) continue;
        const r = rand();
        if (r < 0.35) {
          novoGrid[y][x].tipo = "monstro";
          const idx = Math.floor(rand() * MONSTER_TABLE.length);
          novoGrid[y][x].monstroId = MONSTER_TABLE[idx].id;
        } else if (r < 0.5) {
          novoGrid[y][x].tipo = "tesouro";
        }
      }
    }

    // posiciona um chefe em uma célula de canto aleatória
    const cantos = [
      [0, 0],
      [0, tamanho - 1],
      [tamanho - 1, 0],
      [tamanho - 1, tamanho - 1],
    ];
    const cantoEscolhido = cantos[Math.floor(rand() * cantos.length)];
    novoGrid[cantoEscolhido[1]][cantoEscolhido[0]].tipo = "chefe";
    const bossIdx = Math.floor(rand() * BOSS_TABLE.length);
    novoGrid[cantoEscolhido[1]][cantoEscolhido[0]].monstroId = BOSS_TABLE[bossIdx].id;

    return novoGrid;
  }

  /* ------------------------------------------------------------------------
   * 8. FILA DE MENSAGENS RPG (evita condições de corrida no processamento)
   * --------------------------------------------------------------------- */
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
        warn("erro ao processar mensagem da fila:", e);
      }
    }, CONFIG.TICK_MS);
  }

  function pararProcessadorDeFila() {
    if (queueTimer) {
      clearInterval(queueTimer);
      queueTimer = null;
    }
    messageQueue = [];
  }

  /* ------------------------------------------------------------------------
   * 9. INTERCEPTAÇÃO DO CHAT (window._hubSocket)
   * Intercepta mensagens de entrada (headers de chat) para identificar
   * pacotes RPG, e mensagens de saída para enviar comandos do jogador.
   * --------------------------------------------------------------------- */
  function instalarHooks() {
    if (hooksInstalled) return;

    if (!window._hubSocket) {
      warn("_hubSocket não encontrado; RPG Overlay funcionará apenas em modo local.");
      return;
    }

    const socket = window._hubSocket;

    // --- Hook de recebimento -------------------------------------------
    // Preferimos usar um listener aditivo se a API suportar; caso não
    // suporte, fazemos wrap na função existente (fallback).
    if (typeof socket.addMessageListener === "function") {
      socket.addMessageListener(CONFIG.HEADERS.CHAT_NORMAL, onChatHeaderRecebido);
      socket.addMessageListener(CONFIG.HEADERS.CHAT_SHOUT, onChatHeaderRecebido);
      socket.addMessageListener(CONFIG.HEADERS.CHAT_WHISPER, onChatHeaderRecebido);
      log("hooks instalados via addMessageListener.");
    } else if (typeof socket.onMessage === "function" || typeof socket.onmessage === "function") {
      // fallback: envolve o handler original preservando seu comportamento
      originalSocketOnMessage = socket.onmessage || socket.onMessage;
      const wrapped = function (evt) {
        try {
          interceptarEventoBruto(evt);
        } catch (e) {
          warn("erro no wrapper de onmessage:", e);
        }
        if (typeof originalSocketOnMessage === "function") {
          return originalSocketOnMessage.call(socket, evt);
        }
      };
      if ("onmessage" in socket) socket.onmessage = wrapped;
      if ("onMessage" in socket) socket.onMessage = wrapped;
      log("hooks instalados via wrap de onmessage (fallback).");
    } else {
      warn("nenhuma API de recebimento reconhecida em _hubSocket.");
    }

    // --- Hook de envio ----------------------------------------------------
    if (typeof socket.send === "function") {
      originalSocketSend = socket.send.bind(socket);
      // Não sobrescrevemos socket.send globalmente para não afetar outras
      // partes do Sang Hub — apenas guardamos a referência para uso no
      // envio de comandos RPG (ver `enviarComandoRPG`).
    }

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
      warn("erro ao remover hooks:", e);
    }
    hooksInstalled = false;
    originalSocketOnMessage = null;
  }

  // Handler chamado quando a API expõe eventos já parseados por header.
  function onChatHeaderRecebido(pacote) {
    try {
      // formato esperado: { remetente: string, mensagem: string, header: number }
      const texto = pacote && (pacote.mensagem || pacote.message || pacote.texto);
      const remetente = (pacote && (pacote.remetente || pacote.sender || pacote.nome)) || "desconhecido";
      if (typeof texto === "string") processarLinhaDeChat(remetente, texto);
    } catch (e) {
      warn("erro em onChatHeaderRecebido:", e);
    }
  }

  // Fallback: quando só temos o evento bruto do WebSocket, tentamos extrair
  // o texto da mensagem manualmente. A estrutura exata do protocolo varia
  // por implementação do Habblive, então este parser é propositalmente
  // tolerante e best-effort.
  function interceptarEventoBruto(evt) {
    if (!evt || typeof evt.data !== "string") return;
    // tenta usar o parser do _lens se disponível (evita duplicar lógica)
    if (window._lens && typeof window._lens.parseIncoming === "function") {
      const parsed = window._lens.parseIncoming(evt.data);
      if (parsed && parsed.header && CONFIG.HEADERS_INVERSE_LOOKUP(parsed.header)) {
        onChatHeaderRecebido(parsed);
      }
      return;
    }
    // heurística simples: procura pelo prefixo RPG diretamente na string bruta
    const idx = evt.data.indexOf(CONFIG.PREFIX);
    if (idx !== -1) {
      const resto = evt.data.slice(idx);
      const partes = resto.split(" ");
      if (partes.length >= 2) {
        processarLinhaDeChat("desconhecido", resto);
      }
    }
  }

  CONFIG.HEADERS_INVERSE_LOOKUP = function (header) {
    return (
      header === CONFIG.HEADERS.CHAT_NORMAL ||
      header === CONFIG.HEADERS.CHAT_SHOUT ||
      header === CONFIG.HEADERS.CHAT_WHISPER
    );
  };

  // Processa uma linha de chat completa, verificando se é um pacote RPG.
  function processarLinhaDeChat(remetente, texto) {
    if (typeof texto !== "string") return;
    if (!texto.startsWith(CONFIG.PREFIX)) return;

    const payloadB64 = texto.slice(CONFIG.PREFIX.length).trim();
    if (!payloadB64) return;

    const decodificado = RpgCodec.decode(payloadB64);
    if (decodificado === null) return;

    // ignora nossos próprios comandos ecoados de volta pelo servidor
    if (remetente === state.nome) return;

    enfileirarMensagem(remetente, decodificado);
  }

  /* ------------------------------------------------------------------------
   * 10. ENVIO DE COMANDOS PELO CHAT
   * --------------------------------------------------------------------- */
  function enviarComandoRPG(comandoTexto) {
    const payload = RpgCodec.encode(comandoTexto);
    const linhaCompleta = CONFIG.PREFIX + payload;

    if (originalSocketSend) {
      try {
        // Formato de envio best-effort; ajuste conforme protocolo real do
        // Habblive caso a assinatura de socket.send difira.
        originalSocketSend(CONFIG.HEADERS.CHAT_NORMAL, linhaCompleta);
      } catch (e) {
        warn("falha ao enviar via _hubSocket.send, tentando fallback de input:", e);
        enviarViaCampoDeChatDOM(linhaCompleta);
      }
    } else {
      enviarViaCampoDeChatDOM(linhaCompleta);
    }

    log("comando local enviado:", comandoTexto);
  }

  // Fallback: injeta a mensagem diretamente no campo de chat visível do
  // cliente e simula o envio, caso não haja acesso direto ao socket.
  function enviarViaCampoDeChatDOM(texto) {
    const campo =
      document.querySelector("#chat-input") ||
      document.querySelector('input[name="chat"]') ||
      document.querySelector(".chat-input textarea");
    if (!campo) {
      warn("não foi possível localizar o campo de chat para fallback de envio.");
      return;
    }
    const valorAnterior = campo.value;
    campo.value = texto;
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true });
    campo.dispatchEvent(enterEvent);
    campo.value = valorAnterior;
  }

  /* ------------------------------------------------------------------------
   * 11. PROCESSAMENTO DE COMANDOS REMOTOS (vindos de outros jogadores)
   * --------------------------------------------------------------------- */
  function processarPayloadRemoto(remetente, texto) {
    // formatos suportados:
    //   "pos <x> <y> <nivel>"   -> atualização de posição de outro jogador
    //   "mover <direcao>"       -> outro jogador se moveu (broadcast)
    //   "log <mensagem>"        -> mensagem de log de batalha de outro jogador
    const partes = texto.split(" ");
    const tipo = partes[0];

    switch (tipo) {
      case "pos": {
        const x = parseInt(partes[1], 10);
        const y = parseInt(partes[2], 10);
        const nivel = parseInt(partes[3], 10) || 1;
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          remotePlayers[remetente] = { x, y, nivel };
          desenharGrid();
        }
        break;
      }
      case "log": {
        adicionarLog(`[${remetente}] ${partes.slice(1).join(" ")}`);
        break;
      }
      default:
        log("comando remoto desconhecido ignorado:", texto);
    }
  }

  // Sempre que o jogador local muda de posição, avisa os demais.
  function propagarPosicao() {
    enviarComandoRPG(`pos ${state.x} ${state.y} ${state.nivel}`);
  }

  function propagarLog(mensagem) {
    enviarComandoRPG(`log ${mensagem}`);
  }

  /* ------------------------------------------------------------------------
   * 12. AÇÕES DO JOGADOR (comandos locais: mover, atacar, defender, etc.)
   * --------------------------------------------------------------------- */
  function comandoMover(direcao) {
    if (battle) {
      adicionarLog("Você está em batalha! Resolva o combate antes de se mover.");
      return;
    }
    const deltas = {
      cima: [0, -1],
      baixo: [0, 1],
      esquerda: [-1, 0],
      direita: [1, 0],
    };
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
    }
  }

  function coletarTesouro() {
    const itens = Object.keys(ITEM_TABLE);
    const escolhido = itens[Math.floor(Math.random() * itens.length)];
    adicionarItemInventario(escolhido, 1);
    adicionarLog(`Você encontrou: ${ITEM_TABLE[escolhido].nome}!`);
    propagarLog(`encontrou um tesouro`);
    salvarEstado();
    atualizarPainelStatus();
    desenharGrid();
  }

  function adicionarItemInventario(itemId, qtd) {
    const existente = state.inventario.find((i) => i.id === itemId);
    if (existente) {
      existente.qtd += qtd;
    } else {
      state.inventario.push({ id: itemId, qtd });
    }
  }

  /* ------------------------------------------------------------------------
   * 13. SISTEMA DE COMBATE POR TURNOS
   * --------------------------------------------------------------------- */
  function iniciarBatalha(monstroBase, ehChefe) {
    const hpMonstro = ehChefe
      ? monstroBase.hp
      : Math.floor(monstroBase.hpMin + Math.random() * (monstroBase.hpMax - monstroBase.hpMin));

    battle = {
      monstro: {
        id: monstroBase.id,
        nome: monstroBase.nome,
        hp: hpMonstro,
        hpMax: hpMonstro,
        atk: monstroBase.atk,
        xp: monstroBase.xp,
        dropChance: monstroBase.dropChance,
      },
      ehChefe,
      defendendo: false,
      turno: "jogador",
    };

    adicionarLog(`⚔️ Um(a) ${battle.monstro.nome} apareceu!`);
    propagarLog(`entrou em combate com ${battle.monstro.nome}`);
    mostrarBotoesBatalha(true);
    atualizarPainelStatus();
  }

  function finalizarBatalha(vitoria) {
    if (!battle) return;
    if (vitoria) {
      const xpGanho = battle.monstro.xp;
      adicionarLog(`Você derrotou ${battle.monstro.nome}! +${xpGanho} XP`);
      propagarLog(`derrotou ${battle.monstro.nome}`);
      ganharExperiencia(xpGanho);

      if (Math.random() < battle.monstro.dropChance) {
        const itens = Object.keys(ITEM_TABLE);
        const escolhido = itens[Math.floor(Math.random() * itens.length)];
        adicionarItemInventario(escolhido, 1);
        adicionarLog(`Drop: ${ITEM_TABLE[escolhido].nome}`);
      }
    }
    battle = null;
    mostrarBotoesBatalha(false);
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
      state.atk += 2;
      state.def += 1;
      state.hp = state.hpMax; // cura completa ao subir de nível
      state.xpProximo = Math.floor(CONFIG.XP_BASE * Math.pow(CONFIG.XP_GROWTH, state.nivel - 1));
      adicionarLog(`🎉 Você subiu para o nível ${state.nivel}!`);
    }
  }

  function comandoAtacar() {
    if (!battle) {
      adicionarLog("Não há batalha em andamento.");
      return;
    }
    const danoJogador = Math.max(1, state.atk - Math.floor(Math.random() * 2));
    battle.monstro.hp -= danoJogador;
    adicionarLog(`Você atacou ${battle.monstro.nome} causando ${danoJogador} de dano.`);

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
    if (Math.random() < CONFIG.FLEE_CHANCE) {
      adicionarLog("Você fugiu com sucesso!");
      propagarLog("fugiu de um combate");
      battle = null;
      mostrarBotoesBatalha(false);
      atualizarPainelStatus();
      salvarEstado();
    } else {
      adicionarLog("A fuga falhou!");
      resolverTurnoMonstro();
    }
  }

  function comandoCurar() {
    const pocao =
      state.inventario.find((i) => i.id === "pocao_grande" && i.qtd > 0) ||
      state.inventario.find((i) => i.id === "pocao_pequena" && i.qtd > 0);

    if (!pocao) {
      adicionarLog("Você não tem poções no inventário.");
      return;
    }
    const cura = ITEM_TABLE[pocao.id].cura;
    state.hp = Math.min(state.hpMax, state.hp + cura);
    pocao.qtd -= 1;
    if (pocao.qtd <= 0) {
      state.inventario = state.inventario.filter((i) => i.qtd > 0);
    }
    adicionarLog(`Você usou ${ITEM_TABLE[pocao.id].nome} e recuperou ${cura} HP.`);
    salvarEstado();
    atualizarPainelStatus();

    if (battle) resolverTurnoMonstro();
  }

  function resolverTurnoMonstro() {
    if (!battle) return;
    let dano = Math.max(1, battle.monstro.atk - state.def + Math.floor(Math.random() * 2));
    if (battle.defendendo) {
      dano = Math.floor(dano * 0.4);
      battle.defendendo = false;
    }
    state.hp -= dano;
    adicionarLog(`${battle.monstro.nome} atacou você causando ${dano} de dano.`);

    if (state.hp <= 0) {
      state.hp = 0;
      adicionarLog("Você foi derrotado! Recuperando HP em segurança...");
      propagarLog("foi derrotado em combate");
      battle = null;
      mostrarBotoesBatalha(false);
      // penalidade leve: recupera metade do HP máximo ao "reviver"
      state.hp = Math.floor(state.hpMax / 2);
      salvarEstado();
    }
    atualizarPainelStatus();
    salvarEstado();
  }

  function comandoStatus() {
    adicionarLog(
      `Nível ${state.nivel} | HP ${state.hp}/${state.hpMax} | XP ${state.xp}/${state.xpProximo} | Pos (${state.x},${state.y})`
    );
  }

  /* ------------------------------------------------------------------------
   * 14. DESPACHO DE COMANDOS DE TEXTO (usado tanto pela UI quanto pelo chat)
   * --------------------------------------------------------------------- */
  function despacharComando(comandoTexto) {
    const partes = comandoTexto.trim().split(/\s+/);
    const acao = partes[0];

    switch (acao) {
      case "mover":
        comandoMover(partes[1]);
        enviarComandoRPG(comandoTexto);
        break;
      case "atacar":
        comandoAtacar();
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
      default:
        adicionarLog(`Comando desconhecido: ${acao}`);
    }
  }

  /* ------------------------------------------------------------------------
   * 15. INTERFACE (DOM) — painel flutuante, arrastável, minimizável
   * --------------------------------------------------------------------- */
  const CORES = {
    vazio: "#2b2b3a",
    monstro: "#7a2b2b",
    tesouro: "#c8a233",
    chefe: "#8a1fbf",
    jogador: "#2ecc71",
    outro: "#3498db",
  };

  function construirUI() {
    const container = document.createElement("div");
    container.id = "rpg-overlay-container";
    container.style.cssText = `
      position: fixed;
      top: 80px;
      left: 20px;
      width: 260px;
      background: #16161f;
      border: 1px solid #333;
      border-radius: 8px;
      font-family: Verdana, Tahoma, sans-serif;
      font-size: 11px;
      color: #eee;
      z-index: 999999;
      box-shadow: 0 4px 18px rgba(0,0,0,0.5);
      user-select: none;
    `;

    container.innerHTML = `
      <div id="rpg-titlebar" style="
        cursor: move;
        background: linear-gradient(90deg,#3a1f5d,#1f2a5d);
        padding: 6px 8px;
        border-radius: 8px 8px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
      ">
        <span>⚔️ RPG Overlay</span>
        <span id="rpg-minimize-btn" style="cursor:pointer; padding: 0 4px;">➖</span>
      </div>
      <div id="rpg-body" style="padding: 8px;">
        <div id="rpg-grid" style="
          display: grid;
          grid-template-columns: repeat(${CONFIG.GRID_SIZE}, 1fr);
          gap: 3px;
          margin-bottom: 8px;
        "></div>
        <div id="rpg-status" style="
          background: #1f1f2b;
          border-radius: 4px;
          padding: 6px;
          margin-bottom: 6px;
          line-height: 1.5;
        "></div>
        <div id="rpg-battle-buttons" style="
          display: none;
          gap: 4px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        "></div>
        <div id="rpg-log" style="
          background: #101018;
          border-radius: 4px;
          padding: 6px;
          height: 80px;
          overflow-y: auto;
          font-size: 10px;
          line-height: 1.4;
        "></div>
        <div id="rpg-controls" style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 3px;
          margin-top: 6px;
        "></div>
      </div>
    `;

    document.body.appendChild(container);

    uiRefs.container = container;
    uiRefs.body = container.querySelector("#rpg-body");
    uiRefs.grid = container.querySelector("#rpg-grid");
    uiRefs.status = container.querySelector("#rpg-status");
    uiRefs.battleButtons = container.querySelector("#rpg-battle-buttons");
    uiRefs.logEl = container.querySelector("#rpg-log");
    uiRefs.controls = container.querySelector("#rpg-controls");
    uiRefs.minimizeBtn = container.querySelector("#rpg-minimize-btn");
    uiRefs.titlebar = container.querySelector("#rpg-titlebar");

    construirBotoesDeMovimento();
    construirBotoesDeBatalha();
    habilitarArrastar(uiRefs.titlebar, container);
    habilitarMinimizar();
  }

  function construirBotoesDeMovimento() {
    const botoes = [
      { label: "⬆️", dir: "cima" },
      { label: "⬅️", dir: "esquerda" },
      { label: "➡️", dir: "direita" },
      { label: "⬇️", dir: "baixo" },
      { label: "📊", dir: null, acao: "status" },
      { label: "🧪", dir: null, acao: "curar" },
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
  }

  function estilizarBotao(btn) {
    btn.style.cssText = `
      background: #24243a;
      border: 1px solid #3a3a55;
      color: #eee;
      border-radius: 4px;
      padding: 4px 2px;
      cursor: pointer;
      font-size: 11px;
    `;
    btn.addEventListener("mouseenter", () => (btn.style.background = "#33335a"));
    btn.addEventListener("mouseleave", () => (btn.style.background = "#24243a"));
  }

  function mostrarBotoesBatalha(mostrar) {
    if (!uiRefs.battleButtons) return;
    uiRefs.battleButtons.style.display = mostrar ? "flex" : "none";
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

    document.addEventListener("mouseup", () => {
      arrastando = false;
    });
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
    if (uiRefs.container && uiRefs.container.parentNode) {
      uiRefs.container.parentNode.removeChild(uiRefs.container);
    }
    uiRefs = {};
  }

  /* ------------------------------------------------------------------------
   * 16. ATUALIZAÇÕES DE INTERFACE
   * --------------------------------------------------------------------- */
  function desenharGrid() {
    if (!uiRefs.grid) return;
    uiRefs.grid.innerHTML = "";

    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        const sala = grid[y][x];
        const celula = document.createElement("div");
        celula.style.cssText = `
          aspect-ratio: 1;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 9px;
          cursor: pointer;
          background: ${obterCorDaCelula(sala, x, y)};
          border: ${x === state.x && y === state.y ? "2px solid #fff" : "1px solid #222"};
        `;
        celula.title = descreverCelula(sala);
        celula.addEventListener("click", () => moverParaCelulaClicada(x, y));
        uiRefs.grid.appendChild(celula);
      }
    }
  }

  function obterCorDaCelula(sala, x, y) {
    if (x === state.x && y === state.y) return CORES.jogador;
    const outroAqui = Object.values(remotePlayers).some((p) => p.x === x && p.y === y);
    if (outroAqui) return CORES.outro;
    if (!sala.revelado && (sala.tipo === "monstro" || sala.tipo === "chefe" || sala.tipo === "tesouro")) {
      // salas não reveladas mostram uma cor neutra de "mistério"
      return "#3a3a4a";
    }
    return CORES[sala.tipo] || CORES.vazio;
  }

  function descreverCelula(sala) {
    if (!sala.revelado) return "???";
    switch (sala.tipo) {
      case "monstro":
        return "Monstro (derrotado ou à espreita)";
      case "chefe":
        return "Chefe";
      case "tesouro":
        return "Tesouro coletado";
      default:
        return "Sala vazia";
    }
  }

  // Movimentação por clique: só permite mover para uma célula adjacente,
  // mantendo a mesma regra de um passo por vez usada no comando de texto.
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

  function atualizarPainelStatus() {
    if (!uiRefs.status) return;
    let html = `
      <strong>${escaparHtml(state.nome)}</strong><br/>
      Nível: ${state.nivel} &nbsp; HP: ${state.hp}/${state.hpMax}<br/>
      XP: ${state.xp}/${state.xpProximo} &nbsp; Pos: (${state.x},${state.y})
    `;
    if (battle) {
      html += `<br/><span style="color:#e74c3c;">
        ${escaparHtml(battle.monstro.nome)} — HP ${battle.monstro.hp}/${battle.monstro.hpMax}
      </span>`;
    }
    uiRefs.status.innerHTML = html;
  }

  const logBuffer = [];
  function adicionarLog(mensagem) {
    logBuffer.push(mensagem);
    while (logBuffer.length > 5) logBuffer.shift();
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

  /* ------------------------------------------------------------------------
   * 17. INTEGRAÇÃO OPCIONAL COM _lens (evita parse duplicado quando possível)
   * --------------------------------------------------------------------- */
  function tentarIntegrarComLens() {
    if (window._lens && typeof window._lens.on === "function") {
      try {
        window._lens.on("chat", (evento) => {
          const texto = evento && (evento.mensagem || evento.text);
          const remetente = evento && (evento.remetente || evento.sender);
          if (typeof texto === "string") processarLinhaDeChat(remetente || "desconhecido", texto);
        });
        log("integração com _lens ativada (evita parse duplicado).");
        return true;
      } catch (e) {
        warn("falha ao integrar com _lens:", e);
      }
    }
    return false;
  }

  /* ------------------------------------------------------------------------
   * 18. CICLO DE VIDA DO MÓDULO: init / kill
   * --------------------------------------------------------------------- */
  function init(opts) {
    opts = opts || {};
    if (typeof opts.debug === "boolean") CONFIG.DEBUG = opts.debug;

    state = carregarEstado();
    grid = gerarGrid(state.seedGrid || gerarSeedPadrao());
    remotePlayers = {};
    battle = null;

    construirUI();
    desenharGrid();
    atualizarPainelStatus();
    adicionarLog("RPG Overlay iniciado. Use os botões ou '/rpg mover cima' etc no chat.");

    const integradoComLens = tentarIntegrarComLens();
    if (!integradoComLens) instalarHooks();

    iniciarProcessadorDeFila();
    propagarPosicao();

    log("módulo RPG Overlay inicializado.", { estado: state });
  }

  function kill() {
    salvarEstado();
    desinstalarHooks();
    pararProcessadorDeFila();
    removerUI();
    state = null;
    grid = null;
    remotePlayers = {};
    battle = null;
    log("módulo RPG Overlay finalizado.");
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
    },
  };
})();
