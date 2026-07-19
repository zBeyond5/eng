// ==UserScript==
// @name         Sang Hub — Módulo Surpresa
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Efeito visual + musical especial, disparado quando o LiveBlock é ativado pelo Hub
// @author       Sang
// ==UserScript==

(function() {
    'use strict';

    const LOG = (...a) => console.log('💌 [Surpresa]', ...a);
    const ERR = (...a) => console.error('💌 [Surpresa]', ...a);

    // ─────────────────────────────────────────────────────────
    // CONFIGURAÇÃO — edite livremente aqui
    // ─────────────────────────────────────────────────────────
    const CONFIG = {
        // Nome exato do card do Hub que deve disparar a surpresa
        TRIGGER_MODULE_NAME: "LiveBlock",

        // Imagem (link direto — o módulo tenta várias extensões automaticamente)
        IMAGE_CANDIDATES: [
            "https://i.imgur.com/w3gMK1Q.jpg",
            "https://i.imgur.com/w3gMK1Q.jpeg",
            "https://i.imgur.com/w3gMK1Q.png",
            "https://i.imgur.com/w3gMK1Q.webp",
        ],

        // Música (YouTube) — ID do vídeo e segundo inicial
        YOUTUBE_ID: "eihpkV7KSKo",
        START_SECONDS: 55,

        // Mensagem animada (uma linha de cada vez, efeito de digitação)
        MESSAGE_LINES: [
            "Oi, meu amor 💕",
            "só passando pra lembrar você...",
            "de que eu te amo mais do que qualquer palavra explica.",
        ],

        // Mostra a surpresa de novo a cada vez que ela ativar o LiveBlock,
        // ou só uma vez por sessão de navegação?
        REPEAT_PER_ACTIVATION: true,
    };
    // ─────────────────────────────────────────────────────────

    if (window._loveSurprise) { try { window._loveSurprise.kill(); } catch(e) {} }
    delete window._loveSurprise;

    let armed = true;      // esperando o clique-gatilho
    let shownOnce = false; // já mostrou nesta sessão
    let overlayEl = null;
    let ytPlayer = null;
    let clickListener = null;

    // ─── Carrega a YouTube IFrame API (uma vez só, mesmo se outro script já usa)
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

    // ─── Imagem com fallback de extensão
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

    // ─── Estilos
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
        animation:loveFadeIn .4s ease-out;font-family:'Poppins',system-ui,sans-serif;}

        #_loveOverlay .love-close{position:absolute;top:22px;right:26px;width:34px;height:34px;border-radius:50%;
        background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.25);color:#ffd9e6;
        display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:16px;transition:background .15s}
        #_loveOverlay .love-close:hover{background:rgba(255,255,255,.18)}

        #_loveOverlay .love-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:20px;max-width:min(90vw,420px)}

        #_loveOverlay .love-frame{position:relative;width:200px;height:200px;border-radius:50%;overflow:hidden;
        border:4px solid #ff6f9c;animation:loveCardIn .5s ease-out, loveGlow 2.4s ease-in-out infinite;background:#2a0f18;
        display:flex;align-items:center;justify-content:center}
        #_loveOverlay .love-frame img{width:100%;height:100%;object-fit:cover}
        #_loveOverlay .love-img-fallback{display:none;font-size:64px}

        #_loveOverlay .love-msg{min-height:64px;text-align:center;color:#ffe3ee;font-size:16px;font-weight:600;
        line-height:1.5;text-shadow:0 2px 12px rgba(255,90,140,.5);animation:loveCardIn .5s ease-out .1s both}
        #_loveOverlay .love-msg .love-caret{display:inline-block;width:2px;background:#ffb6cf;margin-left:2px;animation:loveBlink 1s step-start infinite}

        #_loveOverlay .love-sound{margin-top:4px;padding:8px 16px;border-radius:999px;background:rgba(255,111,156,.16);
        border:1px solid rgba(255,111,156,.5);color:#ffd9e6;font-size:12px;font-weight:700;cursor:pointer;display:none}
        #_loveOverlay .love-sound:hover{background:rgba(255,111,156,.28)}

        #_loveHearts{position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden}
        #_loveHearts span{position:absolute;bottom:-40px;animation:loveFloatUp linear forwards;will-change:transform,opacity}

        #_loveYt{position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0}
        `;
        document.head.appendChild(style);
    }

    // ─── Explosão de corações
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

    // ─── Mensagem com efeito de digitação, linha por linha
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

    // ─── Player de música (só áudio — iframe fica escondido)
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
                    playerVars: { autoplay: 1, start: CONFIG.START_SECONDS, controls: 0, disablekb: 1, modestbranding: 1 },
                    events: {
                        onReady: (e) => {
                            try {
                                e.target.unMute();
                                e.target.setVolume(70);
                                e.target.playVideo();
                            } catch(err) {}
                            resolve(true);
                        },
                        onError: (e) => { ERR('Falha no player do YouTube:', e); resolve(false); }
                    }
                });
            });
        } catch (e) {
            ERR('Falha ao iniciar música:', e);
            return false;
        }
    }

    // ─── Monta e mostra a surpresa
    async function showSurprise() {
        if (overlayEl) return; // já está aberta
        injectStyles();

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
                <div class="love-sound">🔊 Tocar música</div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlayEl = overlay;

        setImageWithFallback(overlay.querySelector('img'), CONFIG.IMAGE_CANDIDATES);
        overlay.querySelector('.love-frame').style.animationName = 'loveCardIn, loveGlow, loveBeat';

        burstHearts(56);
        const heartLoop = setInterval(() => { if (overlayEl) burstHearts(18); }, 1600);

        typeLines(overlay.querySelector('.love-msg'), CONFIG.MESSAGE_LINES);

        const soundBtn = overlay.querySelector('.love-sound');
        const played = await startMusic();
        if (!played || (ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() !== 1)) {
            // Autoplay pode ser bloqueado pelo navegador — libera um botão que
            // conta como um clique novo (gesto garantido, toca sem falhar).
            soundBtn.style.display = 'inline-block';
            soundBtn.addEventListener('click', () => {
                try { ytPlayer.unMute(); ytPlayer.playVideo(); } catch(e) {}
                soundBtn.style.display = 'none';
            });
        }

        function close() {
            clearInterval(heartLoop);
            try { ytPlayer && ytPlayer.stopVideo && ytPlayer.stopVideo(); } catch(e) {}
            overlay.remove();
            const hearts = document.getElementById('_loveHearts');
            if (hearts) hearts.remove();
            overlayEl = null;
        }

        overlay.querySelector('.love-close').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        document.addEventListener('keydown', function escClose(e) {
            if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escClose); }
        });

        window._loveSurprise._close = close;
    }

    // ─── Escuta o clique no card do LiveBlock dentro do Hub (gesto real do usuário,
    // necessário pro navegador permitir tocar áudio automaticamente)
    function armTrigger() {
        clickListener = (e) => {
            if (!armed) return;
            const item = e.target.closest('.hub-item');
            if (!item) return;
            const name = item.querySelector('.hub-name')?.textContent?.trim();
            if (name !== CONFIG.TRIGGER_MODULE_NAME) return;
            if (shownOnce && !CONFIG.REPEAT_PER_ACTIVATION) return;

            shownOnce = true;
            showSurprise();
        };
        document.addEventListener('click', clickListener, true);
        LOG(`Armado — esperando clique em "${CONFIG.TRIGGER_MODULE_NAME}" no painel do Hub`);
    }

    function kill() {
        armed = false;
        if (clickListener) document.removeEventListener('click', clickListener, true);
        if (overlayEl && window._loveSurprise?._close) window._loveSurprise._close();
        const hearts = document.getElementById('_loveHearts');
        if (hearts) hearts.remove();
        const style = document.querySelector('style[data-love]');
        if (style) style.remove();
    }

    window._loveSurprise = { kill };
    armTrigger();

})();
