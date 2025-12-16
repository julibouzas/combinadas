import './style.css'
import { io } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { EVENTS_DB } from './data.js';

// DOM Elements
const appDiv = document.querySelector('#app');
const socket = io('/', { path: '/socket.io' }); // Uses proxy in Vite or direct if same origin

// State
let currentState = 'lobby'; // lobby, draft, game
let roomId = null;
let playerName = '';
let draftSelection = { easy: new Set(), hard: new Set() };
let gameBoard = []; // 16 items
let markedIndices = new Set();
let players = [];

// Init
function render() {
  appDiv.innerHTML = '';

  if (currentState === 'lobby') renderLobby();
  else if (currentState === 'draft') renderDraft();
  else if (currentState === 'game') renderGame();
}

function renderLobby() {
  const container = document.createElement('div');
  container.className = 'screen active';

  // Check if joining via URL
  const urlParams = new URLSearchParams(window.location.search);
  const joinId = urlParams.get('room');

  container.innerHTML = `
    <img src="/logo.jpg" alt="Logo Combinadas" style="width: 250px; height: 250px; object-fit: contain; margin-bottom: 20px;">
    <h1>COMBINADAS</h1>
    <p class="subtitle">¡Juega con amigos!</p>
    
    <div class="input-group">
      <input type="text" id="playerNameInput" placeholder="Tu nombre" maxlength="15">
      <input type="text" id="roomIdInput" placeholder="Nombre de la sala" value="${joinId || ''}" ${joinId ? 'disabled' : ''}>
      <button id="enterBtn" class="btn-primary">Entrar a Sala</button>
    </div>
  `;

  appDiv.appendChild(container);

  const btn = document.getElementById('enterBtn');
  const nameInput = document.getElementById('playerNameInput');
  const roomInput = document.getElementById('roomIdInput');

  const onEnter = () => {
    playerName = nameInput.value.trim();
    roomId = roomInput.value.trim();

    if (!playerName) {
      alert('¡Ponele nombre, pibe!');
      return;
    }
    if (!roomId) {
      alert('¡Elegí un nombre para la sala!');
      return;
    }

    // Always use enterRoom logic
    socket.emit('enterRoom', { roomId, playerName });
  };

  btn.addEventListener('click', onEnter);

}

function renderDraft() {
  const container = document.createElement('div');
  container.className = 'screen active';

  const easyCount = draftSelection.easy.size;
  const hardCount = draftSelection.hard.size;
  const isReady = easyCount === 8 && hardCount === 8;

  container.innerHTML = `
    <h1>Armá tu Cartón</h1>
    <p class="subtitle">Sala: <span style="color:var(--accent-gold)">${roomId}</span></p>
    <p style="margin-bottom:20px">Elige <span style="color:#4caf50">8 Fáciles</span> y <span style="color:#ff4d4d">8 Difíciles</span>.</p>
    <div style="margin-bottom:20px">
      <span id="easyCounter" class="${easyCount === 8 ? 'draft-counter complete' : ''}">${easyCount}/8 Fáciles</span> | 
      <span id="hardCounter" class="${hardCount === 8 ? 'draft-counter complete' : ''}">${hardCount}/8 Difíciles</span>
    </div>

    <div class="draft-container">
      <div class="draft-column" id="easyList">
        <h3 style="color:#4caf50">Fáciles</h3>
        <!-- Items here -->
      </div>
      <div class="draft-column" id="hardList">
        <h3 style="color:#ff4d4d">Difíciles</h3>
        <!-- Items here -->
      </div>
    </div>

    <button id="readyBtn" class="btn-primary" ${isReady ? '' : 'disabled'}>¡Listo para Jugar!</button>
  `;

  appDiv.appendChild(container);

  // Render lists
  const easyList = document.getElementById('easyList');
  EVENTS_DB.easy.forEach(event => {
    const el = document.createElement('div');
    el.className = `draft-item ${draftSelection.easy.has(event) ? 'selected' : ''}`;
    el.textContent = event;
    el.onclick = () => toggleSelection('easy', event, el);
    easyList.appendChild(el);
  });

  const hardList = document.getElementById('hardList');
  EVENTS_DB.hard.forEach(event => {
    const el = document.createElement('div');
    el.className = `draft-item ${draftSelection.hard.has(event) ? 'selected' : ''}`;
    el.textContent = event;
    el.onclick = () => toggleSelection('hard', event, el);
    hardList.appendChild(el);
  });

  document.getElementById('readyBtn').onclick = () => {
    // Generate final board (randomize the 16 selected items)
    const allSelected = [...draftSelection.easy, ...draftSelection.hard];
    gameBoard = allSelected.sort(() => 0.5 - Math.random());

    socket.emit('playerReady', { roomId, board: gameBoard });

    // Show waiting state
    appDiv.innerHTML = `
      <h1>Esperando rivales...</h1>
      <div class="subtitle">Sala: ${roomId}</div>
      <div id="lobbyPlayers"></div>
    `;
    updateLobbyList();
  };
}

function updateLobbyList() {
  const el = document.getElementById('lobbyPlayers');
  if (el) {
    el.innerHTML = players.map(p =>
      `<div style="margin:10px">${p.name} ${p.ready ? '✅' : '⏳'}</div>`
    ).join('');
  }
}

function toggleSelection(type, event, element) {
  const set = draftSelection[type];
  if (set.has(event)) {
    set.delete(event);
    element.classList.remove('selected');
  } else {
    if (set.size >= 8) return; // Limit reached
    set.add(event);
    element.classList.add('selected');
  }

  // Update counters & button
  const easyCount = draftSelection.easy.size;
  const hardCount = draftSelection.hard.size;
  const isReady = easyCount === 8 && hardCount === 8;

  document.getElementById('easyCounter').textContent = `${easyCount}/8 Fáciles`;
  document.getElementById('easyCounter').className = easyCount === 8 ? 'draft-counter complete' : '';

  document.getElementById('hardCounter').textContent = `${hardCount}/8 Difíciles`;
  document.getElementById('hardCounter').className = hardCount === 8 ? 'draft-counter complete' : '';

  const btn = document.getElementById('readyBtn');
  if (btn) btn.disabled = !isReady;
}

function renderGame() {
  const container = document.createElement('div');
  container.className = 'screen active game-layout';

  container.innerHTML = `
    <div class="leaderboard" id="leaderboard">    
      <!-- Updated dynamically -->
    </div>

    <div class="bingo-board-4x4" id="board">
      <!-- Cells -->
    </div>

    <button id="bingoBtn" class="bingo-btn" style="display:none">¡BINGO!</button>
    
    <!-- Win Modal -->
    <div class="modal-overlay" id="winModal">
      <div class="modal-content" style="background:white;color:black;padding:30px;border-radius:20px;text-align:center">
        <h2 style="font-family:'Russo One';font-size:2.5rem;color:var(--accent-gold);margin-bottom:10px">¡TENEMOS GANADOR!</h2>
        <p id="winnerText" style="font-size:1.5rem;font-weight:bold"></p>
        <button onclick="location.reload()" class="btn-primary" style="margin-top:20px">Menu Principal</button>
      </div>
    </div>
  `;

  appDiv.appendChild(container);

  updateLeaderboard();
  renderBoardCells();

  document.getElementById('bingoBtn').onclick = () => {
    socket.emit('bingoClaim', { roomId });
  };
}

function updateLeaderboard() {
  const el = document.getElementById('leaderboard');
  if (!el) return;

  // Sort by progress
  const sorted = [...players].sort((a, b) => b.progress - a.progress);

  el.innerHTML = sorted.map((p, i) => `
    <div class="player-badge ${i === 0 ? 'leader' : ''}">
      <span class="p-name">${p.name}:</span>
      <span class="p-score">${p.progress}/16</span>
    </div>
  `).join('');
}

function renderBoardCells() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  gameBoard.forEach((phrase, index) => {
    const cell = document.createElement('div');
    cell.className = `cell ${markedIndices.has(index) ? 'marked' : ''}`;
    cell.textContent = phrase;
    cell.onclick = () => handleCellClick(index, cell);
    boardEl.appendChild(cell);
  });
}

function handleCellClick(index, cell) {
  if (markedIndices.has(index)) {
    markedIndices.delete(index);
    cell.classList.remove('marked');
  } else {
    markedIndices.add(index);
    cell.classList.add('marked');
  }

  // Update Server
  socket.emit('updateProgress', { roomId, markedCount: markedIndices.size });

  // Check local win to show button
  checkLocalWin();
}

function checkLocalWin() {
  // 4x4 Grid
  // Rows: 0-3, 4-7, 8-11, 12-15
  // Cols: 0,4,8,12...

  const wins = [];
  // Rows
  for (let r = 0; r < 4; r++) wins.push([r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3]);
  // Cols
  for (let c = 0; c < 4; c++) wins.push([c, c + 4, c + 8, c + 12]);
  // Diags
  wins.push([0, 5, 10, 15]);
  wins.push([3, 6, 9, 12]);

  let hasWin = false;
  for (let combo of wins) {
    if (combo.every(i => markedIndices.has(i))) {
      hasWin = true;
    }
  }

  const bingoBtn = document.getElementById('bingoBtn');
  if (hasWin || markedIndices.size === 16) {
    bingoBtn.style.display = 'block';
  } else {
    bingoBtn.style.display = 'none';
  }
}

// Socket Events
socket.on('joinedRoom', ({ roomId: id }) => {
  roomId = id;
  // Push URL history
  window.history.pushState({}, '', `?room=${roomId}`);
  currentState = 'draft';
  render();
});

socket.on('roomUpdate', ({ players: serverPlayers }) => {
  players = serverPlayers;
  if (currentState === 'draft' && document.getElementById('lobbyPlayers')) {
    updateLobbyList();
  }
});

socket.on('gameStart', ({ players: serverPlayers }) => {
  players = serverPlayers;
  currentState = 'game';
  render();
});

socket.on('leaderboardUpdate', ({ players: serverPlayers }) => {
  players = serverPlayers;
  if (currentState === 'game') updateLeaderboard();
});

socket.on('gameWon', ({ winner }) => {
  const modal = document.getElementById('winModal');
  const text = document.getElementById('winnerText');
  if (modal && text) {
    text.textContent = winner;
    modal.classList.add('active');

    // Confetti
    const duration = 3000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#ffd700', '#ffffff', '#ff4d4d']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#ffd700', '#ffffff', '#ff4d4d']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
});

socket.on('error', (msg) => {
  alert(msg);
  location.href = '/';
});

// Initial Render
render();
