/*const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // Manejar mensajes de señalización
    socket.on('signal', (data) => {
        console.log(`Señal recibida de ${socket.id}:`, data);
        // Retransmitir señal a todos los demás clientes excepto al remitente
        socket.broadcast.emit('signal', { ...data, sender: socket.id });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
    });
});

server.listen(3000, () => console.log('Servidor en http://localhost:3000'));
*/
/*const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

// Almacenamiento temporal de señales por cliente
let emisorSignals = null;

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // Enviar señales almacenadas al receptor si es necesario
    if (emisorSignals) {
        console.log('Retransmitiendo señales almacenadas al receptor');
        socket.emit('signal', emisorSignals.description);
        if (emisorSignals.candidates) {
            emisorSignals.candidates.forEach(candidate => {
                socket.emit('signal', candidate);
            });
        }
    }

    socket.on('signal', (data) => {
        console.log(`Señal recibida de ${socket.id}:`, data);

        if (data.description) {
            if (data.description.type === 'offer') {
                // Guardar la oferta del emisor
                emisorSignals = {
                    description: data,
                    candidates: [] // Inicializar lista de candidatos
                };
            } else if (data.description.type === 'answer') {
                // Retransmitir la respuesta al emisor
                socket.broadcast.emit('signal', data);
            }
        } else if (data.candidate) {
            // Guardar los candidatos ICE
            if (emisorSignals) {
                emisorSignals.candidates.push(data);
            }
            // Retransmitir candidatos
            socket.broadcast.emit('signal', data);
        }
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
    });
});

server.listen(3000, () => console.log('Servidor en http://localhost:3000'));
*/
/*const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public')); // Servir archivos estáticos

let emisorId = null;

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('set-role', (role) => {
        if (role === 'emisor') {
            emisorId = socket.id;
            console.log(`El emisor ahora es: ${emisorId}`);
        }
        socket.broadcast.emit('user-connected', { id: socket.id, role });
    });

    // Retransmitir señales entre el emisor y los receptores
    socket.on('signal', (data) => {
        const { to, signal } = data;
        if (to) {
            io.to(to).emit('signal', { from: socket.id, signal });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Usuario desconectado: ${socket.id}`);
        if (socket.id === emisorId) {
            emisorId = null;
            console.log('El emisor se ha desconectado.');
        }
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});

server.listen(3000, () => console.log('Servidor corriendo en http://localhost:3000'));
*/
require('dotenv').config(); // Cargar variables de entorno desde .env
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const CryptoJS = require('crypto-js'); // Librería para cifrado
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
function hashData(data) {
    return crypto.pbkdf2Sync(data, salt, iterations, keyLength, 'sha512').toString('hex');
}

// Función para descifrar el `groupId`
function decryptGroupId(encryptedGroupId) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedGroupId, secretKey);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error('Error al descifrar el groupId:', error);
        return null;
    }
}

io.on('connection', (socket) => {
    console.log(`Usuario conectado: ${socket.id}`);

    socket.on('set-role', ({ role, encryptedGroupId }) => {
        const groupId = decryptGroupId(encryptedGroupId);
        if (!groupId) {
            console.log(`Conexión denegada para ${socket.id}: groupId inválido`);
            socket.disconnect();
            return;
        }

        const hashedGroupId = hashData(groupId); // Generar hash extendido del `groupId`

        users[socket.id] = { role, groupId: hashedGroupId }; // Almacenar hash
        console.log(`Usuario ${socket.id} asignado al grupo ${hashedGroupId} como ${role}`);
        socket.join(groupId); // Unirse al grupo en el servidor
        socket.broadcast.to(groupId).emit('user-connected', { id: socket.id, role });
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


