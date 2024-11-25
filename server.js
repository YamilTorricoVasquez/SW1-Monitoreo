require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

const users = {}; // Diccionario para almacenar usuarios y sus grupos

// Puerto del servidor desde el .env
const port = parseInt(process.env.PORT, 10) || 3000; // Puerto del servidor

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    // Configurar rol y grupo
    socket.on('set-role', ({ role, groupId }) => {
        if (!groupId || !role) {
            console.log(`Conexión denegada para ${socket.id}: Datos inválidos`);
            socket.disconnect();
            return;
        }

        users[socket.id] = { role, groupId }; // Almacenar datos en texto plano
        console.log(`Usuario ${socket.id} asignado al grupo ${groupId} como ${role}`);
        socket.join(groupId); // Unirse al grupo
        socket.broadcast.to(groupId).emit('user-connected', { id: socket.id, role });
    });

    // Manejar señales WebRTC
    socket.on('signal', ({ to, signal }) => {
        const sender = users[socket.id];
        if (!sender) return;

        const recipient = users[to];
        if (!recipient || sender.groupId !== recipient.groupId) {
            console.log(`Intento de señalización fuera del grupo denegado: ${socket.id} → ${to}`);
            return;
        }

        io.to(to).emit('signal', { from: socket.id, signal });
    });

    // Manejar desconexiones
    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            console.log(`Usuario desconectado: ${socket.id} del grupo ${user.groupId}`);
            socket.broadcast.to(user.groupId).emit('user-disconnected', socket.id);
            delete users[socket.id];
        }
    });
});

server.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
