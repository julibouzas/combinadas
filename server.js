import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Serve static files from the build directory
app.use(express.static(path.join(__dirname, 'dist')));

const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow Vite client
        methods: ["GET", "POST"]
    }
});

// rooms: { [roomId]: { players: { [socketId]: { name, ready, board: [], progress: 0 } }, status: 'lobby'|'playing' } }
const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('enterRoom', ({ roomId, playerName }) => {
        // Sanitize roomId (allow letters, numbers, dashes)
        const safeRoomId = roomId.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');

        if (!safeRoomId) {
            socket.emit('error', 'Nombre de sala inválido. Usa letras y números.');
            return;
        }

        if (!rooms[safeRoomId]) {
            // Create new room if it doesn't exist
            rooms[safeRoomId] = {
                id: safeRoomId,
                status: 'lobby',
                players: {}
            };
        }

        joinRoom(socket, safeRoomId, playerName);
    });

    socket.on('playerReady', ({ roomId, board }) => {
        if (!rooms[roomId]) return;

        const player = rooms[roomId].players[socket.id];
        if (player) {
            player.ready = true;
            player.board = board;
            player.progress = 0;

            // Check if all players are ready
            const allReady = Object.values(rooms[roomId].players).every(p => p.ready);
            if (allReady && Object.keys(rooms[roomId].players).length > 0) {
                rooms[roomId].status = 'playing';
                io.to(roomId).emit('gameStart', { players: getPublicPlayers(roomId) });
            } else {
                io.to(roomId).emit('roomUpdate', { players: getPublicPlayers(roomId) });
            }
        }
    });

    socket.on('updateProgress', ({ roomId, markedCount }) => {
        if (!rooms[roomId]) return;

        const player = rooms[roomId].players[socket.id];
        if (player) {
            player.progress = markedCount;
            io.to(roomId).emit('leaderboardUpdate', { players: getPublicPlayers(roomId) });
        }
    });

    socket.on('bingoClaim', ({ roomId }) => {
        if (!rooms[roomId]) return;
        const player = rooms[roomId].players[socket.id];
        io.to(roomId).emit('gameWon', { winner: player.name });
    });

    socket.on('disconnect', () => {
        // Basic cleanup logic could go here
        console.log('User disconnected:', socket.id);
    });
});

function joinRoom(socket, roomId, playerName) {
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
        id: socket.id,
        name: playerName,
        ready: false,
        progress: 0,
        board: []
    };

    socket.emit('joinedRoom', { roomId, playerId: socket.id });
    io.to(roomId).emit('roomUpdate', { players: getPublicPlayers(roomId) });
}

function getPublicPlayers(roomId) {
    if (!rooms[roomId]) return [];
    return Object.values(rooms[roomId].players).map(p => ({
        id: p.id,
        name: p.name,
        ready: p.ready,
        progress: p.progress
    }));
}

// Handle SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
