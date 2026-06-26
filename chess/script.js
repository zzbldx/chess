// ==========================================
// 基础配置
// ==========================================
const PIECE_SYMBOLS = { 'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟' };

const INITIAL_BOARD_SETUP = [
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
];

// ==========================================
// 游戏状态与全局变量
// ==========================================
let board = [];             
let currentTurn = 'white';   
let selectedSquare = null;   
let activeLegalMoves = [];   

// 新增模式变量
let gameMode = 'pvp'; // 'pvp' (人人) 或 'pve' (人机)
let aiDifficulty = 2; // 默认推算深度
let isAILogicRunning = false; // 防连点锁

// DOM 元素
const mainMenuEl = document.getElementById('main-menu');
const gameContainerEl = document.getElementById('game-container');
const boardEl = document.getElementById('chessboard');
const statusEl = document.getElementById('game-status');
const turnIconEl = document.getElementById('turn-icon');

// ==========================================
// 游戏流程控制
// ==========================================
function startGame(mode) {
    gameMode = mode;
    if (mode === 'pve') {
        aiDifficulty = parseInt(document.getElementById('ai-difficulty').value);
    }
    mainMenuEl.style.display = 'none';
    gameContainerEl.style.display = 'flex';
    initGame();
}

function returnToMenu() {
    gameContainerEl.style.display = 'none';
    mainMenuEl.style.display = 'flex';
}
document.getElementById('reset-btn').addEventListener('click', returnToMenu);

function initGame() {
    board = [];
    for (let r = 0; r < 8; r++) {
        board.push([]);
        for (let c = 0; c < 8; c++) {
            const item = INITIAL_BOARD_SETUP[r][c];
            if (item) {
                const isBlack = item === item.toUpperCase();
                board[r].push({ type: item.toLowerCase(), color: isBlack ? 'black' : 'white' });
            } else {
                board[r].push(null);
            }
        }
    }
    currentTurn = 'white';
    selectedSquare = null;
    activeLegalMoves = [];
    isAILogicRunning = false;
    updateStatusPanel("比赛开始！轮到白方下子", 'white');
    createBoardDOM();
}

// ==========================================
// DOM 渲染逻辑
// ==========================================
function createBoardDOM() {
    boardEl.innerHTML = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const squareEl = document.createElement('div');
            squareEl.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            squareEl.dataset.row = r;
            squareEl.dataset.col = c;

            const piece = board[r][c];
            if (piece) {
                squareEl.textContent = PIECE_SYMBOLS[piece.type] + '\uFE0E';
                squareEl.classList.add(piece.color === 'white' ? 'piece-white' : 'piece-black');
            }

            if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
                squareEl.classList.add('selected');
            }

            const isHint = activeLegalMoves.some(m => m.r === r && m.c === c);
            if (isHint) {
                squareEl.classList.add('hint');
                if (piece) squareEl.classList.add('has-enemy');
            }

            squareEl.addEventListener('click', () => handleSquareClick(r, c));
            boardEl.appendChild(squareEl);
        }
    }
}

function updateStatusPanel(message, turn) {
    statusEl.textContent = message;
    turnIconEl.className = `turn-indicator turn-${turn}`;
}

// ==========================================
// 交互点击与执行逻辑
// ==========================================
function handleSquareClick(r, c) {
    if (isAILogicRunning) return; // 机器思考时锁死玩家操作

    const piece = board[r][c];
    const isClickingValidMove = activeLegalMoves.some(m => m.r === r && m.c === c);
    
    if (isClickingValidMove && selectedSquare) {
        executeMove(selectedSquare.r, selectedSquare.c, r, c);
        return;
    }

    // 只能点击属于当前回合颜色的棋子 (如果是人机模式，限制只能点白棋)
    if (piece && piece.color === currentTurn && !(gameMode === 'pve' && currentTurn === 'black')) {
        selectedSquare = { r, c };
        activeLegalMoves = getAbsoluteLegalMoves(r, c);
        createBoardDOM();
    } else {
        selectedSquare = null;
        activeLegalMoves = [];
        createBoardDOM();
    }
}

function executeMove(fromR, fromC, toR, toC) {
    // 虚拟走步(同步 DOM)
    doVirtualMove(board, fromR, fromC, toR, toC);

    currentTurn = currentTurn === 'white' ? 'black' : 'white';
    selectedSquare = null;
    activeLegalMoves = [];

    const isGameOver = checkGameEndConditions();
    
    if (!isGameOver && gameMode === 'pve' && currentTurn === 'black') {
        triggerAI();
    }
}

// 提取出一个干净的、不会引起副作用的棋盘修改函数（用于真实移动和AI预测）
function doVirtualMove(virtualBoard, fromR, fromC, toR, toC) {
    const movingPiece = virtualBoard[fromR][fromC];
    const capturedPiece = virtualBoard[toR][toC];
    
    virtualBoard[toR][toC] = movingPiece;
    virtualBoard[fromR][fromC] = null;

    let isPromoted = false;
    if (movingPiece.type === 'p' && (toR === 0 || toR === 7)) {
        movingPiece.type = 'q'; 
        isPromoted = true;
    }
    
    // 返回被捕获的棋子和升变信息，方便 undo
    return { capturedPiece, isPromoted };
}

function undoVirtualMove(virtualBoard, fromR, fromC, toR, toC, capturedPiece, isPromoted) {
    const movingPiece = virtualBoard[toR][toC];
    virtualBoard[fromR][fromC] = movingPiece;
    virtualBoard[toR][toC] = capturedPiece;

    if (isPromoted) {
        movingPiece.type = 'p'; // 恢复成兵
    }
}

function checkGameEndConditions() {
    const hasMoves = playerHasAnyLegalMoves(currentTurn);
    const kingSafe = isKingSafe(currentTurn);

    if (!hasMoves) {
        if (!kingSafe) {
            const winner = currentTurn === 'white' ? '黑方 (Black)' : '白方 (White)';
            updateStatusPanel(`绝杀将死！${winner} 获得最终胜利！`, currentTurn);
        } else {
            updateStatusPanel("僵局逼和！没有任何合法移动，游戏平局。", currentTurn);
        }
        createBoardDOM();
        return true;
    } else {
        if (!kingSafe) {
            updateStatusPanel(`【将军！】轮到${currentTurn === 'white' ? '白' : '黑'}方决断`, currentTurn);
        } else {
            updateStatusPanel(`轮到${currentTurn === 'white' ? '白' : '黑'}方下子`, currentTurn);
        }
        createBoardDOM();
        return false;
    }
}

// ==========================================
// 新增：AI 核心算法 (Minimax + Alpha Beta Pruning)
// ==========================================

function triggerAI() {
    isAILogicRunning = true;
    updateStatusPanel("AI 正在思考中...", 'black');
    createBoardDOM(); // 刷新界面让文字显示出来

    // 给 UI 一点时间刷新，使用 setTimeout 将复杂计算推入异步宏任务队列
    setTimeout(() => {
        const bestMove = getBestMove(aiDifficulty);
        if (bestMove) {
            executeMove(bestMove.fromR, bestMove.fromC, bestMove.toR, bestMove.toC);
        }
        isAILogicRunning = false;
    }, 100);
}

// 棋子基础价值评分表
const PIECE_VALUES = {
    'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900
};

// 简单的位置权重矩阵 (鼓励棋子走向棋盘中央)
const CENTER_BONUS = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [0,  0,  0,  0,  0,  0,  0,  0],
    [0,  0,  1,  1,  1,  1,  0,  0],
    [0,  0,  1,  2,  2,  1,  0,  0],
    [0,  0,  1,  2,  2,  1,  0,  0],
    [0,  0,  1,  1,  1,  1,  0,  0],
    [0,  0,  0,  0,  0,  0,  0,  0],
    [0,  0,  0,  0,  0,  0,  0,  0]
];

// 局面评估函数 (站在黑方的角度，分越高越有利于黑方)
function evaluateBoard() {
    let score = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                // 基础价值
                let val = PIECE_VALUES[piece.type];
                // 增加中场控制奖励 (小幅权重)
                val += CENTER_BONUS[r][c] * 0.5;

                // 黑方加分(AI)，白方扣分(玩家)
                if (piece.color === 'black') {
                    score += val;
                } else {
                    score -= val;
                }
            }
        }
    }
    return score;
}

// 获取某个颜色的全盘所有合法动作
function getAllLegalMovesForColor(color) {
    const allMoves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === color) {
                const moves = getAbsoluteLegalMoves(r, c);
                for (let m of moves) {
                    // 把起点的坐标也带上
                    allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c });
                }
            }
        }
    }
    // 加入一点随机打乱，防止AI开局每次走同样无聊的固定步
    return allMoves.sort(() => Math.random() - 0.5);
}

function getBestMove(depth) {
    const validMoves = getAllLegalMovesForColor('black');
    if (validMoves.length === 0) return null;

    let bestMove = null;
    // 初始化极小极大寻找黑方(Max)最大值
    let bestValue = -99999; 
    let alpha = -99999;
    let beta = 99999;

    for (let move of validMoves) {
        // 1. 模拟落子
        const { capturedPiece, isPromoted } = doVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC);
        
        // 2. 递归推演这步棋之后，对方(White, Minimizing)的应对
        const boardValue = minimax(depth - 1, alpha, beta, false);
        
        // 3. 撤销模拟
        undoVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC, capturedPiece, isPromoted);

        // 4. 更新最高分
        if (boardValue > bestValue) {
            bestValue = boardValue;
            bestMove = move;
        }
        alpha = Math.max(alpha, bestValue);
    }

    return bestMove || validMoves[0]; // 如果全是负收益，随便选合法的兜底
}

function minimax(depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0) {
        return evaluateBoard();
    }

    const color = isMaximizingPlayer ? 'black' : 'white';
    const moves = getAllLegalMovesForColor(color);

    // 终局检测处理
    if (moves.length === 0) {
        if (!isKingSafe(color)) {
            // 被将死了。当前玩家输了。
            // 如果是黑方(Max)输了，返回极小值。如果是白方(Min)输了，返回极大值
            return isMaximizingPlayer ? -99999 + (3-depth) : 99999 - (3-depth); 
        }
        return 0; // 逼和平局
    }

    if (isMaximizingPlayer) {
        let maxEval = -99999;
        for (let move of moves) {
            const { capturedPiece, isPromoted } = doVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC);
            const ev = minimax(depth - 1, alpha, beta, false);
            undoVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC, capturedPiece, isPromoted);
            
            maxEval = Math.max(maxEval, ev);
            alpha = Math.max(alpha, ev);
            if (beta <= alpha) break; // Alpha-Beta 剪枝
        }
        return maxEval;
    } else {
        let minEval = 99999;
        for (let move of moves) {
            const { capturedPiece, isPromoted } = doVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC);
            const ev = minimax(depth - 1, alpha, beta, true);
            undoVirtualMove(board, move.fromR, move.fromC, move.toR, move.toC, capturedPiece, isPromoted);
            
            minEval = Math.min(minEval, ev);
            beta = Math.min(beta, ev);
            if (beta <= alpha) break; // Alpha-Beta 剪枝
        }
        return minEval;
    }
}


// ==========================================
// 几何走法与合法性验证 (复用原有逻辑)
// ==========================================
function getPseudoLegalMoves(r, c) {
    const piece = board[r][c];
    if (!piece) return [];
    const moves = [];
    const color = piece.color;
    const enemyColor = color === 'white' ? 'black' : 'white';
    const straightDirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const diagonalDirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    switch (piece.type) {
        case 'r': parseSlidingMoves(r, c, straightDirs, color, moves); break;
        case 'b': parseSlidingMoves(r, c, diagonalDirs, color, moves); break;
        case 'q': parseSlidingMoves(r, c, [...straightDirs, ...diagonalDirs], color, moves); break;
        case 'n': 
            const knightOffsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
            for (let offset of knightOffsets) {
                const nr = r + offset[0], nc = c + offset[1];
                if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === enemyColor)) moves.push({ r: nr, c: nc });
            }
            break;
        case 'k': 
            const kingOffsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1],  [1, 0],  [1, 1]];
            for (let offset of kingOffsets) {
                const nr = r + offset[0], nc = c + offset[1];
                if (inBounds(nr, nc) && (!board[nr][nc] || board[nr][nc].color === enemyColor)) moves.push({ r: nr, c: nc });
            }
            break;
        case 'p': 
            const dir = color === 'white' ? -1 : 1; 
            const startRow = color === 'white' ? 6 : 1;
            const nextR = r + dir;
            if (inBounds(nextR, c) && !board[nextR][c]) {
                moves.push({ r: nextR, c: c });
                const doubleR = r + (dir * 2);
                if (r === startRow && inBounds(doubleR, c) && !board[doubleR][c]) moves.push({ r: doubleR, c: c });
            }
            const attackCols = [c - 1, c + 1];
            for (let ac of attackCols) {
                if (inBounds(nextR, ac)) {
                    const target = board[nextR][ac];
                    if (target && target.color === enemyColor) moves.push({ r: nextR, c: ac });
                }
            }
            break;
    }
    return moves;
}

function parseSlidingMoves(r, c, directions, color, moves) {
    const enemyColor = color === 'white' ? 'black' : 'white';
    for (let d of directions) {
        let step = 1;
        while (true) {
            const nr = r + d[0] * step;
            const nc = c + d[1] * step;
            if (!inBounds(nr, nc)) break;
            const target = board[nr][nc];
            if (!target) {
                moves.push({ r: nr, c: nc }); 
            } else {
                if (target.color === enemyColor) moves.push({ r: nr, c: nc }); 
                break; 
            }
            step++;
        }
    }
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function isKingSafe(kingColor) {
    let kingPos = null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].type === 'k' && board[r][c].color === kingColor) {
                kingPos = { r, c }; break;
            }
        }
        if (kingPos) break;
    }
    if (!kingPos) return true; 

    const enemyColor = kingColor === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === enemyColor) {
                if (board[r][c].type === 'p') {
                    const pDir = enemyColor === 'white' ? -1 : 1;
                    if (r + pDir === kingPos.r && (c - 1 === kingPos.c || c + 1 === kingPos.c)) return false; 
                } else {
                    const enemyMoves = getPseudoLegalMoves(r, c);
                    if (enemyMoves.some(m => m.r === kingPos.r && m.c === kingPos.c)) return false; 
                }
            }
        }
    }
    return true;
}

function getAbsoluteLegalMoves(r, c) {
    const originalPiece = board[r][c];
    if (!originalPiece) return [];
    const pseudoMoves = getPseudoLegalMoves(r, c);
    const legalMoves = [];

    for (let move of pseudoMoves) {
        // 使用沙盒提取出来的 undo 方法来验证，更加稳健
        const { capturedPiece, isPromoted } = doVirtualMove(board, r, c, move.r, move.c);
        if (isKingSafe(originalPiece.color)) legalMoves.push(move); 
        undoVirtualMove(board, r, c, move.r, move.c, capturedPiece, isPromoted);
    }
    return legalMoves;
}

function playerHasAnyLegalMoves(playerColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] && board[r][c].color === playerColor) {
                if (getAbsoluteLegalMoves(r, c).length > 0) return true;
            }
        }
    }
    return false;
}