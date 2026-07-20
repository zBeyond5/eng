(function() {
    'use strict';

    const LOG = (...a) => console.log('💌 [Surpresa]', ...a);
    const ERR = (...a) => console.error('💌 [Surpresa]', ...a);

    // ─── VERIFICAÇÃO DE DOMÍNIO E CAMINHO ───
    function isAllowed() {
        const host = window.location.hostname;
        const path = window.location.pathname;
        return host === 'habblive.in' && path.includes('/bigclient');
    }

    // ─── CONFIG ───
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
        HUB_WAIT_TIMEOUT: 10000,
    };

    // ─── ESTADO GLOBAL ───
    const G = (window.__loveG__ = window.__loveG__ || {
        shown: false,
        pendingTimer: null,
        heartsInterval: null,
        origAudioCtor: null,
        audioPatched: false,
        mutedElements: [],
    });

    // ─── LIMPEZA DOM ───
    function hardCleanupDom() {
        document.querySelectorAll('#_loveOverlay, #_loveHearts, #_loveYt, style[data-love]').forEach(el => el.remove());
    }

    // ─── RESTAURAR ÁUDIO ───
    function restoreRadio() {
        if (G.audioPatched && G.origAudioCtor) {
            window.Audio = G.origAudioCtor;
            G.origAudioCtor = null;
            G.audioPatched = false;
        }
        G.mutedElements.forEach(({ el, wasMuted, wasVolume, wasPaused }) => {
            try {
                el.muted = wasMuted;
                el.volume = wasVolume;
                if (!wasPaused) el.play().catch(() => {});
            } catch(e) {}
        });
        G.mutedElements = [];
    }

    // ─── KILL ───
    function kill() {
        if (G.pendingTimer) { clearTimeout(G.pendingTimer); G.pendingTimer = null; }
        if (G.heartsInterval) { clearInterval(G.heartsInterval); G.heartsInterval = null; }
        try { G.ytPlayer && G.ytPlayer.stopVideo && G.ytPlayer.stopVideo(); } catch(e) {}
        restoreRadio();
        hardCleanupDom();
        LOG('Módulo surpresa encerrado.');
    }

    if (window._loveSurprise) { try { window._loveSurprise.kill(); } catch(e) {} }
    hardCleanupDom();
    window._loveSurprise = { kill };

    // ─── RÁDIO DO JOGO ───
    function stopRadio() {
        try {
            document.querySelectorAll('audio, video').forEach(el => {
                if (G.mutedElements.some(m => m.el === el)) return;
                G.mutedElements.push({ el, wasMuted: el.muted, wasVolume: el.volume, wasPaused: el.paused });
                try { el.pause(); el.muted = true; el.volume = 0; } catch(e) {}
            });

            document.querySelectorAll('object, embed, iframe[src*="radio"], iframe[src*="stream"]').forEach(el => {
                try { if (el.tagName === 'IFRAME') el.dataset.loveHidden ? null : (el.src = 'about:blank'); else el.style.display = 'none'; } catch(e) {}
            });

            if (!G.audioPatched) {
                const origAudio = window.Audio;
                G.origAudioCtor = origAudio;
                window.Audio = function(...args) {
                    const audio = new origAudio(...args);
                    setTimeout(() => { try { audio.pause(); audio.muted = true; audio.volume = 0; } catch(e) {} }, 0);
                    return audio;
                };
                window.Audio.prototype = origAudio.prototype;
                G.audioPatched = true;
            }
            LOG('🔇 Rádio do jogo pausada.');
        } catch(e) {
            ERR('❌ Erro ao parar a rádio:', e);
        }
    }

    // ─── YOUTUBE API ───
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

    // ─── IMAGEM ───
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

    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ─── ESTILOS ───
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
        z-index:2147483647;display:flex;align-items:center;justify-content:center;
        animation:${prefersReducedMotion ? 'none' : 'loveFadeIn .4s ease-out'};font-family:'Poppins',system-ui,sans-serif;cursor:pointer;}

        #_loveOverlay .love-close{position:absolute;top:22px;right:26px;width:38px;height:38px;border-radius:50%;
        background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);color:#ffd9e6;
        display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;transition:background .15s;
        z-index:2;pointer-events:auto}
        #_loveOverlay .love-close:hover{background:rgba(255,255,255,.22)}

        #_loveOverlay .love-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:20px;max-width:min(90vw,420px);pointer-events:none}
        #_loveOverlay .love-card *{pointer-events:auto}

        #_loveOverlay .love-frame{position:relative;width:200px;height:200px;border-radius:50%;overflow:hidden;
        border:4px solid #ff6f9c;background:#2a0f18;display:flex;align-items:center;justify-content:center;
        animation:${prefersReducedMotion ? 'none' : 'loveCardIn .5s ease-out, loveGlow 2.4s ease-in-out infinite, loveBeat 1.8s ease-in-out infinite'};}
        #_loveOverlay .love-frame img{width:100%;height:100%;object-fit:cover}
        #_loveOverlay .love-img-fallback{display:none;font-size:64px}

        #_loveOverlay .love-msg{min-height:64px;text-align:center;color:#ffe3ee;font-size:16px;font-weight:600;
        line-height:1.5;text-shadow:0 2px 12px rgba(255,90,140,.5)}
        #_loveOverlay .love-msg .love-caret{display:inline-block;width:2px;background:#ffb6cf;margin-left:2px;
        animation:${prefersReducedMotion ? 'none' : 'loveBlink 1s step-start infinite'}}

        #_loveOverlay .love-hint{position:absolute;bottom:40px;left:0;right:0;text-align:center;color:rgba(255,255,255,.4);
        font-size:12px;font-weight:300;letter-spacing:1px}
        #_loveOverlay .love-hint span{display:inline-block;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.05);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.06)}

        #_loveHearts{position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden}
        #_loveHearts span{position:absolute;bottom:-40px;pointer-events:none;animation:loveFloatUp linear forwards;will-change:transform,opacity}

        #_loveYt{position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;right:0}

        #_loveOverlay .love-sound-btn{display:none;margin-top:4px;padding:8px 16px;border-radius:999px;
        background:rgba(255,111,156,.16);border:1px solid rgba(255,111,156,.5);color:#ffd9e6;font-size:12px;font-weight:700;
        cursor:pointer;transition:background .15s;pointer-events:auto}
        #_loveOverlay .love-sound-btn:hover{background:rgba(255,111,156,.28)}
        #_loveOverlay .love-sound-btn.visible{display:inline-block}
        `;
        document.head.appendChild(style);
    }

    // ─── CORAÇÕES ───
    function burstHearts(count = 56) {
        if (prefersReducedMotion) return;
        if (document.hidden) return;
        let box = document.getElementById('_loveHearts');
        if (!box) {
            box = document.createElement('div');
            box.id = '_loveHearts';
            document.body.appendChild(box);
        }
        const glyphs = ['💖', '💕', '❤️', '✨', '💗'];
        const frag = document.createDocumentFragment();
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
            frag.appendChild(el);
            setTimeout(() => el.remove(), (duration + delay) * 1000 + 200);
        }
        box.appendChild(frag);
    }

    // ─── DIGITAÇÃO ───
    function typeLines(el, lines, { charDelay = 32, lineDelay = 900 } = {}) {
        if (prefersReducedMotion) {
            el.innerHTML = lines.join('<br>');
            return;
        }
        el.innerHTML = '<span class="love-caret">&nbsp;</span>';
        const caret = el.querySelector('.love-caret');
        let li = 0;

        function typeLine() {
            if (li >= lines.length) { caret.remove(); return; }
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

    // ─── MÚSICA ───
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
                G.ytPlayer = new YT.Player(holder, {
                    videoId: CONFIG.YOUTUBE_ID,
                    playerVars: {
                        autoplay: 1, start: CONFIG.START_SECONDS, controls: 0,
                        disablekb: 1, modestbranding: 1, mute: 1,
                    },
                    events: {
                        onReady: () => { LOG('Player pronto (mutado).'); resolve(true); },
                        onError: (e) => { ERR('Erro no player:', e); resolve(false); }
                    }
                });
            });
        } catch (e) {
            ERR('Falha ao iniciar música:', e);
            return false;
        }
    }

    // ─── SOM ───
    let soundActivated = false;
    function activateSound() {
        if (soundActivated || !G.ytPlayer) return;
        try {
            G.ytPlayer.unMute();
            G.ytPlayer.setVolume(70);
            G.ytPlayer.playVideo();
            soundActivated = true;
            LOG('🔊 Som ativado!');
            document.querySelector('.love-hint')?.style.setProperty('opacity', '0');
            document.querySelector('.love-sound-btn')?.classList.remove('visible');
        } catch(e) {
            ERR('Falha ao ativar som:', e);
        }
    }

    // ─── SURPRESA ───
    async function showSurprise() {
        if (document.getElementById('_loveOverlay')) {
            LOG('Já existe uma surpresa aberta.');
            return;
        }
        injectStyles();
        stopRadio();

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

        setImageWithFallback(overlay.querySelector('img'), CONFIG.IMAGE_CANDIDATES);
        burstHearts(56);
        G.heartsInterval = setInterval(() => burstHearts(18), 1600);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && G.heartsInterval) { clearInterval(G.heartsInterval); G.heartsInterval = null; }
            else if (!document.hidden && document.getElementById('_loveOverlay') && !G.heartsInterval) {
                G.heartsInterval = setInterval(() => burstHearts(18), 1600);
            }
        });

        typeLines(overlay.querySelector('.love-msg'), CONFIG.MESSAGE_LINES);
        await startMusic();

        overlay.addEventListener('click', (e) => {
            if (e.target.closest('.love-close')) return;
            activateSound();
        });
        overlay.querySelector('.love-sound-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            activateSound();
        });

        function close() {
            if (G.heartsInterval) { clearInterval(G.heartsInterval); G.heartsInterval = null; }
            try { G.ytPlayer && G.ytPlayer.stopVideo && G.ytPlayer.stopVideo(); } catch(e) {}
            restoreRadio();
            hardCleanupDom();
            LOG('Surpresa fechada.');
        }

        overlay.querySelector('.love-close').addEventListener('click', (e) => { e.stopPropagation(); close(); });
        function escClose(e) {
            if (e.key === 'Escape' && document.getElementById('_loveOverlay')) {
                close();
                document.removeEventListener('keydown', escClose);
            }
        }
        document.addEventListener('keydown', escClose);

        window._loveSurprise.close = close;

        setTimeout(() => {
            if (!soundActivated && document.getElementById('_loveOverlay')) {
                overlay.querySelector('.love-sound-btn').classList.add('visible');
            }
        }, 5000);
    }

    // ─── GATILHO ───
    function triggerSurprise() {
        if (G.shown && CONFIG.ONCE_PER_SESSION) {
            LOG('Surpresa já mostrada nesta sessão.');
            return;
        }
        G.shown = true;
        if (G.pendingTimer) clearTimeout(G.pendingTimer);
        G.pendingTimer = setTimeout(() => { G.pendingTimer = null; showSurprise(); }, CONFIG.DELAY_BEFORE_SHOW);
    }

    // ─── ESPERA HUB ───
    function waitForHub(timeoutMs) {
        return new Promise((resolve) => {
            const start = Date.now();
            (function check() {
                if (window._hubUI && typeof window._hubUI.kill === 'function') return resolve(true);
                if (Date.now() - start > timeoutMs) { LOG('Hub não detectado a tempo.'); return resolve(false); }
                setTimeout(check, 300);
            })();
        });
    }

    // ─── INIT ───
    async function init() {
        if (!isAllowed()) {
            LOG('⏭️ Domínio ou caminho não permitido. Módulo inativo.');
            return;
        }
        LOG('✅ Domínio permitido. Inicializando...');
        await waitForHub(CONFIG.HUB_WAIT_TIMEOUT);
        triggerSurprise();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
