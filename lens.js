(function() {
    'use strict';

    if (window._lens) {
        try { if (typeof window._lens.kill === 'function') window._lens.kill(); } catch(e) {}
        delete window._lens;
    }

    var WEBHOOK_URL = 'https://discord.com/api/webhooks/1529335560240496773/rLO9IMqqb05_dT75Rxu51kX8wxzl_10UmNkhh-dmvqUfDQxLCZbKa8ziXvWLDxZdBBV0';
    var DEBUG = false; // Altere para true para ver logs detalhados

    var _origWebSocket = window.WebSocket;
    var _ws = null;
    var _queue = [];
    var _isSending = false;
    var _virtualIdMap = {};
    var _myVirtualId = null;
    var _accountName = '';
    var _recentPackets = new Map();
    var _recentOutbound = [];
    var _noop = function() {};

    function _log() {
        if (DEBUG) console.log.apply(console, ['[Lens]'].concat(Array.prototype.slice.call(arguments)));
    }

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
        var result = '';
        parts.forEach(function(p) {
            if (p.type === 'year') result += p.value;
            else if (p.type === 'month') result += '/' + p.value;
            else if (p.type === 'day') result += '/' + p.value + ' ';
            else if (p.type === 'hour') result += p.value + ':';
            else if (p.type === 'minute') result += p.value + ':';
            else if (p.type === 'second') result += p.value;
        });
        return result;
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
        if (_recentPackets.has(key) && now - _recentPackets.get(key) < 80) return true;
        _recentPackets.set(key, now);
        if (_recentPackets.size > 120) {
            var toDelete = [];
            _recentPackets.forEach(function(t, k) { if (now - t > 300) toDelete.push(k); });
            toDelete.forEach(function(k) { _recentPackets.delete(k); });
        }
        return false;
    }

    function _isEcho(virtualId, text) {
        var now = Date.now();
        _recentOutbound = _recentOutbound.filter(function(e) { return now - e.time < 3000; });
        var cleanText = text.replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '').trim().toLowerCase();
        for (var i = 0; i < _recentOutbound.length; i++) {
            var outClean = _recentOutbound[i].text.replace(/[^\x20-\x7E\u00C0-\u00FF]/g, '').trim().toLowerCase();
            if (outClean === cleanText && now - _recentOutbound[i].time < 2000) {
                _log('Eco filtrado por texto:', cleanText);
                return true;
            }
        }
        if (_myVirtualId !== null && virtualId === _myVirtualId) {
            _log('Eco filtrado por virtualId:', virtualId);
            return true;
        }
        return false;
    }

    function _stripHTML(str) {
        if (!str) return '';
        return str.replace(/<[^>]*>/g, '').trim();
    }

    function _parseUnit(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return;
            var header = view.getUint16(4, false);
            if (header !== 3111) return;
            
            // CORRIGIDO: offset 6 = contagem de usuários
            var offset = 6;
            var userCount = view.getUint16(offset, false);
            offset += 2;
            
            _log('UNIT: ' + userCount + ' usuários');
            
            for (var i = 0; i < userCount && offset < view.byteLength - 4; i++) {
                if (offset + 4 > view.byteLength) break;
                
                var userId = view.getUint16(offset, false);
                offset += 2;
                var nameLen = view.getUint16(offset, false);
                offset += 2;
                
                if (nameLen > 0 && nameLen < 64 && offset + nameLen <= view.byteLength) {
                    var nameBytes = new Uint8Array(data, offset, nameLen);
                    var name = new TextDecoder().decode(nameBytes);
                    offset += nameLen;
                    var clean = _stripHTML(name);
                    if (clean && clean.length > 1) {
                        _virtualIdMap[userId] = clean;
                        _log('UNIT: #' + userId + ' = "' + clean + '"');
                        if (clean === _accountName && _accountName) {
                            _myVirtualId = userId;
                            _log('-> Meu virtualId:', _myVirtualId);
                        }
                    }
                }
                
                // Skip: motto (2 bytes len + string), figure (2 bytes len + string), sex (1 byte), achievement score (2 bytes + array)
                if (offset + 2 <= view.byteLength) {
                    var mottoLen = view.getUint16(offset, false);
                    if (mottoLen > 0 && mottoLen < 256) offset += 2 + mottoLen;
                    else offset += 2;
                }
                if (offset + 2 <= view.byteLength) {
                    var figureLen = view.getUint16(offset, false);
                    if (figureLen > 0 && figureLen < 256) offset += 2 + figureLen;
                    else offset += 2;
                }
                if (offset + 1 <= view.byteLength) offset += 1; // sex
            }
        } catch(e) {
            _log('Erro _parseUnit:', e);
        }
    }

    function _parseItemWall(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return;
            var header = view.getUint16(4, false);
            if (header !== 2739) return;
            
            var offset = 6;
            var count = view.getUint16(offset, false);
            offset += 2;
            
            _log('ITEM_WALL: ' + count + ' usuários');
            
            for (var i = 0; i < count && offset < view.byteLength - 4; i++) {
                if (offset + 4 > view.byteLength) break;
                
                var userId = view.getUint16(offset, false);
                offset += 2;
                var nameLen = view.getUint16(offset, false);
                offset += 2;
                
                if (nameLen > 0 && nameLen < 64 && offset + nameLen <= view.byteLength) {
                    var nameBytes = new Uint8Array(data, offset, nameLen);
                    var name = new TextDecoder().decode(nameBytes);
                    offset += nameLen;
                    var clean = _stripHTML(name);
                    if (clean && clean.length > 1) {
                        if (!_virtualIdMap[userId]) {
                            _virtualIdMap[userId] = clean;
                            _log('ITEM_WALL: #' + userId + ' = "' + clean + '"');
                        }
                        if (clean === _accountName && _accountName) {
                            _myVirtualId = userId;
                            _log('-> Meu virtualId:', _myVirtualId);
                        }
                    }
                }
            }
        } catch(e) {
            _log('Erro _parseItemWall:', e);
        }
    }

    function _parseChangeName(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 16) return;
            var header = view.getUint16(4, false);
            if (header !== 2447) return;
            
            // Tenta múltiplos offsets possíveis
            var offsetsToTry = [
                [12, 14, 16],  // offset mais comum
                [8, 10, 12],   // alternativa
                [10, 12, 14],  // outra alternativa
            ];
            
            for (var o = 0; o < offsetsToTry.length; o++) {
                var virtualIdOffset = offsetsToTry[o][0];
                var nameLenOffset = offsetsToTry[o][1];
                var nameOffset = offsetsToTry[o][2];
                
                if (view.byteLength < nameOffset + 2) continue;
                
                var virtualId = view.getUint16(virtualIdOffset, false);
                var nameLen = view.getUint16(nameLenOffset, false);
                
                if (nameLen > 0 && nameLen < 128 && nameOffset + nameLen <= view.byteLength) {
                    var nameBytes = new Uint8Array(data, nameOffset, nameLen);
                    var name = new TextDecoder().decode(nameBytes);
                    var clean = _stripHTML(name);
                    if (clean && clean.length > 1) {
                        _virtualIdMap[virtualId] = clean;
                        _log('CHANGE_NAME: #' + virtualId + ' = "' + clean + '" (offset ' + o + ')');
                        if (clean === _accountName && _accountName) {
                            _myVirtualId = virtualId;
                            _log('-> Meu virtualId:', _myVirtualId);
                        }
                        return;
                    }
                }
            }
        } catch(e) {
            _log('Erro _parseChangeName:', e);
        }
    }

    function _parseUserInfo(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return;
            var header = view.getUint16(4, false);
            if (header !== 2583) return;
            
            // offset 6: userId (2 bytes), offset 8: nameLen (2 bytes), offset 10: name
            var userId = view.getUint16(6, false);
            var nameLen = view.getUint16(8, false);
            
            if (nameLen > 0 && nameLen < 32 && 10 + nameLen <= view.byteLength) {
                var nameBytes = new Uint8Array(data, 10, nameLen);
                var name = new TextDecoder().decode(nameBytes).trim();
                if (name && name.length > 1) {
                    _accountName = name;
                    _log('USER_INFO: accountName = "' + _accountName + '"');
                    
                    // Verifica se já sabemos o virtualId
                    for (var vid in _virtualIdMap) {
                        if (_virtualIdMap[vid] === _accountName) {
                            _myVirtualId = parseInt(vid);
                            _log('-> Meu virtualId:', _myVirtualId);
                            break;
                        }
                    }
                }
            }
        } catch(e) {
            _log('Erro _parseUserInfo:', e);
        }
    }

    function _sendToDiscord(message) {
        if (!message || message.length < 5) return;
        _queue.push(message);
        if (!_isSending) _processQueue();
    }

    function _processQueue() {
        if (_isSending || _queue.length === 0) return;
        _isSending = true;
        var batch = _queue.splice(0, 5);
        var content = batch.join('\n');
        
        // Trunca se ultrapassar limite do Discord
        if (content.length > 1950) {
            content = content.substring(0, 1950) + '...';
        }
        
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: content })
        }).catch(_noop).finally(function() {
            _isSending = false;
            setTimeout(_processQueue, 400);
        });
    }

    function _parseInboundChat(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 10) return null;
            
            var header = view.getUint16(4, false);
            if (header !== 1146 && header !== 25 && header !== 890) return null;
            
            _log('Chat INBOUND header=' + header + ', length=' + view.byteLength);
            
            var offset = 6;
            var targetId = null;
            
            // CORRIGIDO: header 890 tem targetId antes do virtualId
            if (header === 890) {
                if (offset + 2 > view.byteLength) return null;
                targetId = view.getUint16(offset, false);
                offset += 2;
                _log('  targetId=' + targetId);
            }
            
            // virtualId
            if (offset + 2 > view.byteLength) return null;
            var virtualId = view.getUint16(offset, false);
            offset += 2;
            
            // msgLen
            if (offset + 2 > view.byteLength) return null;
            var msgLen = view.getUint16(offset, false);
            offset += 2;
            
            _log('  virtualId=' + virtualId + ', msgLen=' + msgLen + ', offset=' + offset);
            
            if (msgLen === 0 || msgLen > 4096) return null;
            if (offset + msgLen > view.byteLength) {
                _log('  Truncado! Esperado ' + msgLen + ', disponível ' + (view.byteLength - offset));
                msgLen = view.byteLength - offset;
                if (msgLen <= 0) return null;
            }
            
            var msgBytes = new Uint8Array(data, offset, msgLen);
            var msg = new TextDecoder().decode(msgBytes);
            
            // Remove null bytes E caracteres de controle que podem estar poluindo
            msg = msg.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
            
            _log('  msg="' + msg + '"');
            
            if (!msg) return null;
            
            // Filtro de eco melhorado
            if (_isEcho(virtualId, msg)) {
                _log('  -> ECO filtrado');
                return null;
            }
            
            var userName = _virtualIdMap[virtualId] || ('User#' + virtualId);
            var time = _nowBrasilia();
            
            if (header === 890) {
                var targetName = targetId !== null ? (_virtualIdMap[targetId] || ('User#' + targetId)) : 'alguém';
                return '`' + time + '` ⬅️ **' + userName + '** ❤️ **' + targetName + '**: ' + msg;
            }
            var label = header === 25 ? '📢 ' : '';
            return '`' + time + '` ⬅️ **' + label + userName + '**: ' + msg;
            
        } catch(e) {
            _log('Erro _parseInboundChat:', e);
            return null;
        }
    }

    function _parseOutboundChat(data) {
        try {
            var view = new DataView(data);
            if (view.byteLength < 8) return null;
            
            var header = view.getUint16(4, false);
            if (header !== 1678) return null;
            
            _log('Chat OUTBOUND length=' + view.byteLength);
            
            // CORRIGIDO: offset 6 = msgLen, offset 8 = mensagem
            var msgLen = view.getUint16(6, false);
            
            _log('  msgLen=' + msgLen);
            
            if (msgLen === 0 || msgLen > 4096 || 8 + msgLen > view.byteLength) return null;
            
            var msgBytes = new Uint8Array(data, 8, msgLen);
            var msg = new TextDecoder().decode(msgBytes);
            msg = msg.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
            
            _log('  msg="' + msg + '"');
            
            if (!msg) return null;
            
            _recentOutbound.push({ text: msg, time: Date.now() });
            
            // Limpa cache antigo
            var now = Date.now();
            _recentOutbound = _recentOutbound.filter(function(e) { return now - e.time < 3000; });
            
            var time = _nowBrasilia();
            return '`' + time + '` ➡️ **Você**: ' + msg;
            
        } catch(e) {
            _log('Erro _parseOutboundChat:', e);
            return null;
        }
    }

    function _processInbound(data) {
        if (!(data instanceof ArrayBuffer)) return;
        if (_isDuplicate(data)) return;
        if (data.byteLength < 6) return;
        
        var header = new DataView(data).getUint16(4, false);
        _log('Inbound header:', header, 'length:', data.byteLength);
        
        // Parse de identificação
        if (header === 3111) _parseUnit(data);
        if (header === 2739) _parseItemWall(data);
        if (header === 2447) _parseChangeName(data);
        if (header === 2583) _parseUserInfo(data);
        
        // Parse de chat
        var msg = _parseInboundChat(data);
        if (msg) _sendToDiscord(msg);
    }

    function _processOutbound(data) {
        if (!(data instanceof ArrayBuffer)) return;
        if (data.byteLength < 6) return;
        
        var header = new DataView(data).getUint16(4, false);
        _log('Outbound header:', header, 'length:', data.byteLength);
        
        var msg = _parseOutboundChat(data);
        if (msg) _sendToDiscord(msg);
    }

    function hookWebSocket() {
        if (window._wsHooked) return;
        window._wsHooked = true;

        window.WebSocket = function() {
            var args = Array.prototype.slice.call(arguments);
            var ws = new (_origWebSocket.bind.apply(_origWebSocket, [null].concat(args)))();
            if (!_ws) {
                _ws = ws;
                _log('WebSocket capturado');
            }

            var origSend = ws.send;
            ws.send = function(data) {
                try { 
                    if (data instanceof ArrayBuffer) {
                        _processOutbound(data);
                    } else if (data instanceof Uint8Array) {
                        _processOutbound(data.buffer);
                    }
                } catch(e) {
                    _log('Erro send:', e);
                }
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
                                try { listener.call(self, new MessageEvent('message', { data: buf, origin: event.origin })); } catch(e) {}
                            });
                            return;
                        }
                        if (data instanceof ArrayBuffer) {
                            _processInbound(data);
                        } else if (data instanceof Uint8Array) {
                            _processInbound(data.buffer);
                        }
                        try { listener.call(self, event); } catch(e) {}
                    };
                    wrapped._lensHooked = true;
                    return origAE.call(ws, type, wrapped, options);
                }
                return origAE.call(ws, type, listener, options);
            };

            return ws;
        };
        
        window.WebSocket.prototype = _origWebSocket.prototype;
        if (_origWebSocket.CONNECTING !== undefined) window.WebSocket.CONNECTING = _origWebSocket.CONNECTING;
        if (_origWebSocket.OPEN !== undefined) window.WebSocket.OPEN = _origWebSocket.OPEN;
        if (_origWebSocket.CLOSING !== undefined) window.WebSocket.CLOSING = _origWebSocket.CLOSING;
        if (_origWebSocket.CLOSED !== undefined) window.WebSocket.CLOSED = _origWebSocket.CLOSED;
    }

    function tryCaptureExisting() {
        var attempts = 0;
        var iv = setInterval(function() {
            if (_ws) { clearInterval(iv); return; }
            var refs = ['ws', 'socket', 'gameSocket', 'connection', 'wsConnection', '_ws'];
            for (var i = 0; i < refs.length; i++) {
                var candidate = window[refs[i]];
                if (candidate && candidate instanceof _origWebSocket && candidate.readyState === 1) { // 1 = OPEN
                    _ws = candidate;
                    _log('WebSocket existente capturado:', refs[i]);
                    clearInterval(iv);
                    return;
                }
            }
            if (++attempts > 100) clearInterval(iv);
        }, 100);
    }

    function init() {
        _log('Inicializando...');
        hookWebSocket();
        tryCaptureExisting();
    }

    function kill() {
        _log('Desligando...');
        _queue.length = 0;
        _recentPackets.clear();
        _recentOutbound = [];
        _virtualIdMap = {};
        _myVirtualId = null;
        _accountName = '';
        window.WebSocket = _origWebSocket;
        window._wsHooked = false;
        _ws = null;
        delete window._lens;
    }

    window._lens = { kill: kill, init: init };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
