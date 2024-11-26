require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto'); // Librería para hashing

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

const users = {}; // Diccionario para almacenar usuarios y sus grupos

// Valores sensibles desde .env
const secretKey = process.env.SECRET_KEY; // Clave secreta
const salt = process.env.SALT; // Salt para hashing
const iterations = parseInt(process.env.ITERATIONS, 10); // Iteraciones para hashing
const keyLength = parseInt(process.env.KEY_LENGTH, 10); // Longitud del hash
const port = parseInt(process.env.PORT, 10); // Puerto del servidor

// Función para enmascarar datos sensibles (PBKDF2)
function hashGroupId(groupId) {
    return crypto.pbkdf2Sync(groupId, salt, iterations, keyLength, 'sha512').toString('hex');
}

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('set-role', ({ role, groupId }) => {
        if (!groupId) {
            console.log(`Conexión denegada para ${socket.id}: groupId inválido`);
            socket.disconnect();
            return;
        }

        const cleanGroupId = groupId.trim().toLowerCase(); // Normalización
        const hashedGroupId = hashGroupId(cleanGroupId); // Generar hash del grupo
        users[socket.id] = { role, groupId: hashedGroupId };
        console.log(`Usuario ${socket.id} asignado al grupo ${hashedGroupId} como ${role}`);

        socket.join(hashedGroupId); // Usar el hash como identificador del grupo
        socket.broadcast.to(hashedGroupId).emit('user-connected', { id: socket.id, role });
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
