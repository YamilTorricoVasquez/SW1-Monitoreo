const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

const users = {}; // Diccionario para almacenar usuarios y sus grupos
const port = 3000; // Puerto del servidor

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('set-role', ({ role, groupId }) => {
        if (!groupId) {
            console.log(`Conexión denegada para ${socket.id}: groupId inválido`);
            socket.disconnect();
            return;
        }
    
        // Limpiar posibles espacios en blanco o caracteres extraños
        const cleanGroupId = groupId.trim();
    
        users[socket.id] = { role, groupId: cleanGroupId };
        console.log(`Usuario ${socket.id} asignado al grupo ${cleanGroupId} como ${role}`);
        socket.join(cleanGroupId); // Usar `cleanGroupId` para unirse al grupo
        socket.broadcast.to(cleanGroupId).emit('user-connected', { id: socket.id, role });
    });
    

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
