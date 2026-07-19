(function() {
    'use strict';

    const LOG = (...a) => console.log('💌 [Surpresa]', ...a);
    const ERR = (...a) => console.error('💌 [Surpresa]', ...a);

    const CONFIG = {
        MESSAGE_LINES: [
            "Oi, meu amor 💕",
            "só passando pra lembrar você...",
            "de que eu te amo mais do que qualquer palavra explica.",
        ],
        YOUTUBE_ID: "eihpkV7KSKo",
        START_SECONDS: 55,
        IMAGE_CANDIDATES: [
            "https://i.imgur.com/w3gMK1Q.jpg",
            "https://i.imgur.com/w3gMK1Q.jpeg",
            "https://i.imgur.com/w3gMK1Q.png",
            "https://i.imgur.com/w3gMK1Q.webp",
        ],
        DELAY_BEFORE_SHOW: 3000,
        ONCE_PER_SESSION: true,
        // Tenta parar a rádio do jogo automaticamente
        STOP_RADIO: true,
        // Aguarda o primeiro clique em qualquer lugar da página para desmutar
        WAIT_FOR_GLOBAL_CLICK: true,
    };

    if (window._loveSurprise) { try { window._loveSurprise.kill(); } catch(e) {} }
    delete window._loveSurprise;

    let overlayEl = null;
    let ytPlayer = null;
    let shownThisSession = false;
    let intervalHearts = null;
    let soundActivated = false;
    let clickHandler = null;

    // ─── PARA A RÁDIO DO JOGO ───
    function stopGameRadio() {
        if (!CONFIG.STOP_RADIO) return;

        try {
            // Procura por elementos de áudio na página
            const audioElements = document.querySelectorAll('audio, video');
            let stopped = 0;
            audioElements.forEach(el => {
                try {
                    if (!el.paused) {
                        el.pause();
                        stopped++;
                        LOG('⏹️ Áudio do jogo pausado');
                    }
                } catch(e) {}
            });

            // Tenta encontrar o player da rádio por classe ou ID comum
            const radioSelectors = [
                '.radio-player', '#radio-player', '.autodj', '#autodj',
                '.stream-player', '#stream-player', '.audio-player',
                '[class*="radio"]', '[id*="radio"]', '[class*="stream"]'
            ];
            radioSelectors.forEach(sel => {
                try {
                    document.querySelectorAll(sel).forEach(el => {
                        if (el.pause && typeof el.pause === 'function') {
                            el.pause();
                            LOG('⏹️ Rádio pausada via seletor: ' + sel);
                        }
                        // Se for um iframe, tenta remover
                        if (el.tagName === 'IFRAME') {
                            el.remove();
                            LOG('🗑️ Iframe de rádio removido');
                        }
                    });
                } catch(e) {}
            });

            // Tenta parar via API do Habbo (se disponível)
            try {
                if (window.NitroConfig && window.NitroConfig.radio) {
                    if (typeof window.NitroConfig.radio.stop === 'function') {
                        window.NitroConfig.radio.stop();
                        LOG('⏹️ Rádio parada via NitroConfig');
                    }
                }
                if (window.habbo && window.habbo.radio) {
                    if (typeof window.habbo.radio.stop === 'function') {
                        window.habbo.radio.stop();
                        LOG('⏹️ Rádio parada via window.habbo');
                    }
                }
            } catch(e) {}

            // Último recurso: tentar remover qualquer elemento que contenha "radio" ou "stream"
            document.querySelectorAll('*').forEach(el => {
                const id = el.id || '';
                const cls = el.className || '';
                const src = el.src || '';
                if (/radio|stream|autodj/i.test(id) || /radio|stream|autodj/i.test(cls) || /radio|stream|autodj/i.test(src)) {
                    try {
                        if (el.pause && typeof el.pause === 'function') {
                            el.pause();
                        }
                        if (el.tagName === 'AUDIO' || el.tagName === 'VIDEO' || el.tagName === 'IFRAME') {
                            el.remove();
                            LOG('🗑️ Elemento de rádio removido: ' + (el.id || el.className || el.src));
                        }
                    } catch(e) {}
                }
            });

            if (stopped > 0) LOG(`⏹️ ${stopped} elemento(s) de áudio pausado(s)`);

        } catch(e) {
            ERR('❌ Erro ao tentar parar a rádio:', e);
        }
    }

    // ─── CARREGAR YOUTUBE API ───
    function loadYouTubeAPI() {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) return resolve(window.YT);
            const prevCallback = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => {
                if (typeof prevCallback === 'function') try { prevCallback(); } catch(e) {}
                resolve(window.YT);
            };
            if (!document.querySelector('script[data-love-yt]')) {
                const tag = document.createElement('script');
                tag.src = "https://www.youtube.com/iframe_api";
                tag.setAttribute('data-love-yt', '1');
                document.head.appendChild(tag);
            }
        });
    }

    function setImageWithFallback(imgEl, candidates, idx = 0) {
        if (idx >= candidates.length) {
            imgEl.style.display = 'none';
            const fallback = imgEl.parentElement.querySelector('.love-img-fallback');
            if (fallback) fallback.style.display = 'flex';
            return;
        }
        imgEl.onerror = () => setImageWithFallback(imgEl, candidates, idx + 1);
        imgEl.src = candidates[idx];
    }

    function injectStyles() {
        if (document.querySelector('style[data-love]')) return;
        const style = document.createElement('style');
        style.setAttribute('data-love', '1');
        style.textContent = `
        @keyframes loveFadeIn{from{opacity:0}to{opacity:1}}
        @keyframes loveCardIn{from{opacity:0;transform:scale(.85) translateY(16px)}to{opacity:1;transform:none}}
        @keyframes loveFloatUp{
            0%{transform:translateY(0) translateX(0) rotate(0deg);opacity:1}
            100%{transform:translateY(var(--ty)) translateX(var(--tx)) rotate(var(--rot));opacity:0}
        }
        @keyframes loveBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        @keyframes loveGlow{0%,100%{box-shadow:0 0 24px 4px rgba(255,90,140,.55)}50%{box-shadow:0 0 40px 10px rgba(255,90,140,.85)}}
        @keyframes loveBlink{50%{opacity:0}}

        #_loveOverlay{position:fixed;inset:0;background:radial-gradient(circle at center,rgba(40,8,24,.92),rgba(10,2,8,.96));
        z-index:2147483646;display:flex;align-items:center;justify-content:center;
        animation:loveFadeIn .4s ease-out;font-family:'Poppins',system-ui,sans-serif;cursor:pointer;}

        #_loveOverlay .love-close{position:absolute;top:22px;right:26px;width:34px;height:34px;border-radius:50%;
        background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);color:#ffd9e6;
        display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:background .15s;z-index:10}
        #_loveOverlay .love-close:hover{background:rgba(255,255,255,.18)}

        #_loveOverlay .love-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:20px;max-width:min(90vw,420px);pointer-events:none}
        #_loveOverlay .love-card *{pointer-events:auto}

        #_loveOverlay .love-frame{position:relative;width:200px;height:200px;border-radius:50%;overflow:hidden;
        border:4px solid #ff6f9c;animation:loveCardIn .5s ease-out, loveGlow 2.4s ease-in-out infinite;background:#2a0f18;
        display:flex;align-items:center;justify-content:center}
        #_loveOverlay .love-frame img{width:100%;height:100%;object-fit:cover}
        #_loveOverlay .love-img-fallback{display:none;font-size:64px}

        #_loveOverlay .love-msg{min-height:64px;text-align:center;color:#ffe3ee;font-size:16px;font-weight:600;
        line-height:1.5;text-shadow:0 2px 12px rgba(255,90,140,.5);animation:loveCardIn .5s ease-out .1s both}
        #_loveOverlay .love-msg .love-caret{display:inline-block;width:2px;background:#ffb6cf;margin-left:2px;animation:loveBlink 1s step-start infinite}

        #_loveOverlay .love-hint{position:absolute;bottom:40px;left:0;right:0;text-align:center;color:rgba(255,255,255,.35);
        font-size:12px;font-weight:300;letter-spacing:1px;animation:loveFadeIn 2s ease-out 1.5s both}
        #_loveOverlay .love-hint span{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.04);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.04)}

        #_loveHearts{position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden}
        #_loveHearts span{position:absolute;bottom:-40px;animation:loveFloatUp linear forwards;will-change:transform,opacity}

        #_loveYt{position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0}

        #_loveOverlay .love-sound-btn{display:none;margin-top:4px;padding:8px 16px;border-radius:999px;
        background:rgba(255,111,156,.16);border:1px solid rgba(255,111,156,.5);color:#ffd9e6;font-size:12px;font-weight:700;
        cursor:pointer;transition:background .15s;pointer-events:auto}
        #_loveOverlay .love-sound-btn:hover{background:rgba(255,111,156,.28)}
        #_loveOverlay .love-sound-btn.visible{display:inline-block}
        `;
        document.head.appendChild(style);
    }

    function burstHearts(count = 56) {
        let box = document.getElementById('_loveHearts');
        if (!box) {
            box = document.createElement('div');
            box.id = '_loveHearts';
            document.body.appendChild(box);
        }
        const glyphs = ['💖', '💕', '❤️', '✨', '💗'];
        for (let i = 0; i < count; i++) {
            const el = document.createElement('span');
            el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
            const size = 14 + Math.random() * 22;
            const left = Math.random() * 100;
            const duration = 2.2 + Math.random() * 2.2;
            const delay = Math.random() * 1.2;
            const tx = (Math.random() - 0.5) * 260;
            const ty = -(window.innerHeight * (0.75 + Math.random() * 0.5));
            const rot = (Math.random() - 0.5) * 240;
            el.style.cssText = `left:${left}vw;font-size:${size}px;animation-duration:${duration}s;animation-delay:${delay}s;--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;`;
            box.appendChild(el);
            setTimeout(() => el.remove(), (duration + delay) * 1000 + 200);
        }
    }

    function typeLines(el, lines, { charDelay = 32, lineDelay = 900 } = {}) {
        el.innerHTML = '<span class="love-caret">&nbsp;</span>';
        const caret = el.querySelector('.love-caret');
        let li = 0;

        function typeLine() {
            if (li >= lines.length) return;
            const line = lines[li];
            let ci = 0;
            const textNode = document.createTextNode('');
            el.insertBefore(textNode, caret);

            const iv = setInterval(() => {
                textNode.textContent += line[ci];
                ci++;
                if (ci >= line.length) {
                    clearInterval(iv);
                    li++;
                    setTimeout(() => {
                        if (li < lines.length) el.insertBefore(document.createElement('br'), caret);
                        typeLine();
                    }, lineDelay);
                }
            }, charDelay);
        }
        typeLine();
    }

    // ─── INICIAR MÚSICA (MUTADA) ───
    async function startMusic() {
        try {
            const YT = await loadYouTubeAPI();
            let holder = document.getElementById('_loveYt');
            if (!holder) {
                holder = document.createElement('div');
                holder.id = '_loveYt';
                document.body.appendChild(holder);
            }

            return new Promise((resolve) => {
                ytPlayer = new YT.Player(holder, {
                    videoId: CONFIG.YOUTUBE_ID,
                    playerVars: {
                        autoplay: 1,
                        start: CONFIG.START_SECONDS,
                        controls: 0,
                        disablekb: 1,
                        modestbranding: 1,
                        mute: 1,
                    },
                    events: {
                        onReady: (e) => {
                            LOG('Player pronto, música mutada. Aguardando clique para ativar som.');
                            resolve(true);
                        },
                        onError: (e) => {
                            ERR('Erro no player:', e);
                            resolve(false);
                        }
                    }
                });
            });
        } catch (e) {
            ERR('Falha ao iniciar música:', e);
            return false;
        }
    }

    // ─── ATIVAR SOM (chamado no clique global) ───
    function activateSound() {
        if (soundActivated) return;
        if (!ytPlayer) return;
        try {
            ytPlayer.unMute();
            ytPlayer.setVolume(70);
            ytPlayer.playVideo();
            soundActivated = true;
            LOG('🔊 Som ativado!');
            // Esconde a dica e o botão
            const hint = document.querySelector('.love-hint');
            if (hint) hint.style.opacity = '0';
            const btn = document.querySelector('.love-sound-btn');
            if (btn) btn.classList.remove('visible');
            // Remove o listener global após ativar
            if (clickHandler) {
                document.removeEventListener('click', clickHandler, true);
                clickHandler = null;
            }
        } catch(e) {
            ERR('Falha ao ativar som:', e);
        }
    }

    // ─── MOSTRAR SURPRESA ───
    async function showSurprise() {
        if (overlayEl) return;
        injectStyles();

        // 1. Para a rádio do jogo
        stopGameRadio();

        const overlay = document.createElement('div');
        overlay.id = '_loveOverlay';
        overlay.innerHTML = `
            <div class="love-close" title="Fechar">✕</div>
            <div class="love-card">
                <div class="love-frame">
                    <img alt="">
                    <div class="love-img-fallback">💖</div>
                </div>
                <div class="love-msg"></div>
                <div class="love-sound-btn">🔊 Clique para ouvir</div>
            </div>
            <div class="love-hint"><span>💫 toque em qualquer lugar para ativar o som</span></div>
        `;
        document.body.appendChild(overlay);
        overlayEl = overlay;

        setImageWithFallback(overlay.querySelector('img'), CONFIG.IMAGE_CANDIDATES);
        overlay.querySelector('.love-frame').style.animationName = 'loveCardIn, loveGlow, loveBeat';

        burstHearts(56);
        intervalHearts = setInterval(() => { if (overlayEl) burstHearts(18); }, 1600);

        typeLines(overlay.querySelector('.love-msg'), CONFIG.MESSAGE_LINES);

        // Inicia a música (mutada)
        await startMusic();

        // ─── ATIVA O SOM NO PRIMEIRO CLIQUE EM QUALQUER LUGAR DA PÁGINA ───
        if (CONFIG.WAIT_FOR_GLOBAL_CLICK && !soundActivated) {
            clickHandler = (e) => {
                // Se clicou no botão de fechar, não ativa (vai fechar de qualquer jeito)
                if (e.target.closest('.love-close')) return;
                activateSound();
                // Remove o listener após o primeiro clique
                document.removeEventListener('click', clickHandler, true);
                clickHandler = null;
            };
            document.addEventListener('click', clickHandler, true);
            LOG('⏳ Aguardando clique em qualquer lugar da página para ativar o som');
        }

        // Também ativa se clicar no botão específico
        const soundBtn = overlay.querySelector('.love-sound-btn');
        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            activateSound();
            if (clickHandler) {
                document.removeEventListener('click', clickHandler, true);
                clickHandler = null;
            }
        });

        // ─── FECHAMENTO ───
        function close() {
            clearInterval(intervalHearts);
            try { ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo(); } catch(e) {}
            overlay.remove();
            const hearts = document.getElementById('_loveHearts');
            if (hearts) hearts.remove();
            overlayEl = null;
            intervalHearts = null;
            // Remove o listener global se ainda estiver ativo
            if (clickHandler) {
                document.removeEventListener('click', clickHandler, true);
                clickHandler = null;
            }
        }

        overlay.querySelector('.love-close').addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });

        document.addEventListener('keydown', function escClose(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
        });

        window._loveSurprise._close = close;

        // ─── FALLBACK: BOTÃO DE SOM APÓS 5 SEGUNDOS ───
        setTimeout(() => {
            if (!soundActivated && overlayEl) {
                soundBtn.classList.add('visible');
                LOG('⏳ Nenhum clique detectado, exibindo botão de som.');
            }
        }, 5000);
    }

    // ─── DISPARAR ───
    function triggerSurprise() {
        if (shownThisSession && CONFIG.ONCE_PER_SESSION) {
            LOG('Surpresa já mostrada nesta sessão.');
            return;
        }
        shownThisSession = true;
        setTimeout(() => {
            showSurprise();
        }, CONFIG.DELAY_BEFORE_SHOW);
    }

    // ─── ESPERAR O HUB ───
    function waitForHub() {
        return new Promise((resolve) => {
            const check = () => {
                if (window._hubUI && typeof window._hubUI.kill === 'function') {
                    LOG('Hub detectado!');
                    resolve();
                } else {
                    setTimeout(check, 300);
                }
            };
            check();
        });
    }

    // ─── INICIALIZAÇÃO ───
    async function init() {
        LOG('Módulo surpresa carregado.');
        await waitForHub();
        LOG('Hub pronto, agendando surpresa...');
        triggerSurprise();
    }

    // ─── KILL ───
    function kill() {
        clearInterval(intervalHearts);
        if (overlayEl && window._loveSurprise?._close) window._loveSurprise._close();
        const hearts = document.getElementById('_loveHearts');
        if (hearts) hearts.remove();
        const style = document.querySelector('style[data-love]');
        if (style) style.remove();
        try { ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo(); } catch(e) {}
        if (clickHandler) {
            document.removeEventListener('click', clickHandler, true);
            clickHandler = null;
        }
        LOG('Módulo surpresa encerrado.');
    }

    window._loveSurprise = { kill };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
