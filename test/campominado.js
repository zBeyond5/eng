// Mini Campo Minado (avançado)
(function() {
    if (window._campoMinado) window._campoMinado.kill();

    const SIZE = 9, MINES = 10;
    let board, revealed, flagged, gameOver;

    const container = document.createElement('div');
    container.style.cssText = `
        position:fixed;bottom:16px;right:16px;z-index:2147483646;
        background:#2b1608;border:2px solid #6b3f14;border-radius:8px;
        padding:10px;font-family:monospace;color:#f3e3c4;
        box-shadow:0 0 16px rgba(0,0,0,.6);user-select:none;
    `;
    container.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">💣 Campo Minado</div>';
    const gridEl = document.createElement('div');
    gridEl.style.display = 'grid';
    gridEl.style.gridTemplateColumns = `repeat(${SIZE}, 22px)`;
    gridEl.style.gap = '2px';
    container.appendChild(gridEl);

    const statusEl = document.createElement('div');
    statusEl.style.marginTop = '6px';
    statusEl.style.fontSize = '10px';
    container.appendChild(statusEl);

    const btnReset = document.createElement('button');
    btnReset.textContent = 'Novo jogo';
    btnReset.style.cssText = `
        margin-top:4px;padding:2px 6px;background:#6b3f14;border:none;
        color:#f3e3c4;border-radius:4px;cursor:pointer;font-size:10px;
    `;
    btnReset.onclick = initBoard;
    container.appendChild(btnReset);

    document.body.appendChild(container);

    function initBoard() {
        board = Array(SIZE).fill().map(() => Array(SIZE).fill(0));
        revealed = Array(SIZE).fill().map(() => Array(SIZE).fill(false));
        flagged = Array(SIZE).fill().map(() => Array(SIZE).fill(false));
        gameOver = false;

        let minesPlanted = 0;
        while (minesPlanted < MINES) {
            const x = Math.floor(Math.random() * SIZE);
            const y = Math.floor(Math.random() * SIZE);
            if (board[y][x] !== -1) {
                board[y][x] = -1;
                minesPlanted++;
            }
        }

        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                if (board[y][x] === -1) continue;
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const ny = y + dy, nx = x + dx;
                        if (ny >= 0 && ny < SIZE && nx >= 0 && nx < SIZE && board[ny][nx] === -1) count++;
                    }
                }
                board[y][x] = count;
            }
        }
        render();
        statusEl.textContent = '';
    }

    function reveal(x, y) {
        if (gameOver || revealed[y][x] || flagged[y][x]) return;
        revealed[y][x] = true;
        if (board[y][x] === -1) {
            gameOver = true;
            for (let i = 0; i < SIZE; i++)
                for (let j = 0; j < SIZE; j++)
                    if (board[i][j] === -1) revealed[i][j] = true;
            statusEl.textContent = '💥 Você perdeu!';
            render();
            return;
        }
        if (board[y][x] === 0) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const ny = y + dy, nx = x + dx;
                    if (ny >= 0 && ny < SIZE && nx >= 0 && nx < SIZE && !revealed[ny][nx])
                        reveal(nx, ny);
                }
            }
        }
        checkWin();
        render();
    }

    function toggleFlag(x, y) {
        if (gameOver || revealed[y][x]) return;
        flagged[y][x] = !flagged[y][x];
        render();
    }

    function checkWin() {
        let unrevealedSafe = 0;
        for (let y = 0; y < SIZE; y++)
            for (let x = 0; x < SIZE; x++)
                if (!revealed[y][x] && board[y][x] !== -1) unrevealedSafe++;
        if (unrevealedSafe === 0) {
            gameOver = true;
            statusEl.textContent = '🎉 Você venceu!';
        }
    }

    function render() {
        gridEl.innerHTML = '';
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const cell = document.createElement('div');
                cell.style.cssText = `
                    width:22px;height:22px;display:flex;align-items:center;justify-content:center;
                    font-size:11px;font-weight:bold;background:#4d2d10;border:1px solid #6b3f14;
                    cursor:pointer;transition:all .1s;
                `;
                if (revealed[y][x]) {
                    cell.style.background = '#1a0d04';
                    cell.textContent = board[y][x] === -1 ? '💣' : board[y][x] || '';
                } else if (flagged[y][x]) {
                    cell.textContent = '🚩';
                }
                cell.addEventListener('click', (e) => {
                    e.preventDefault();
                    reveal(x, y);
                });
                cell.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    toggleFlag(x, y);
                });
                gridEl.appendChild(cell);
            }
        }
    }

    initBoard();

    window._campoMinado = {
        kill: function() {
            container.remove();
            delete window._campoMinado;
        }
    };
})();
