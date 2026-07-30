// Tema Escuro (avançado)
(function() {
    if (window._temaDark) window._temaDark.kill();

    const style = document.createElement('style');
    style.textContent = `
        body { background-color: #0f0f1a !important; }
        .room-background, .habbo-room { filter: brightness(0.7) saturate(0.8); }
        .chat-bubble { background: #1e1e2e !important; color: #e0e0e0 !important; }
        .chat-input { background: #2a2a3c !important; color: white !important; }
        button, .btn { border-radius: 6px !important; opacity: 0.9; }
        button:hover, .btn:hover { opacity: 1; }
    `;
    document.head.appendChild(style);

    window._temaDark = {
        kill: function() {
            style.remove();
            delete window._temaDark;
        }
    };
})();
