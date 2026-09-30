import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Inicialización de la aplicación de Express y Groq
const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CHATS_FILE = path.join(__dirname, 'chats.json');

// Funciones auxiliares para leer y guardar JSON
function leerChats() {
  if (!fs.existsSync(CHATS_FILE)) {
    fs.writeFileSync(CHATS_FILE, JSON.stringify({}), 'utf-8');
    return {};
  }
  try {
    const data = fs.readFileSync(CHATS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return {};
  }
}

function guardarChats(chats) {
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2), 'utf-8');
}

const SYSTEM_INSTRUCTION = {
  role: 'system',
  content: 'Eres IAvel, un asistente virtual útil, atento y amigable.'
};

// 2. Rutas del API
app.get('/api/chats', (req, res) => {
  const { userId } = req.query;
  const chats = leerChats();
  
  const lista = Object.keys(chats)
    .filter(id => chats[id].userId === userId)
    .map(id => ({
      id,
      titulo: chats[id].titulo || 'Nuevo Chat'
    }));
    
  res.json(lista);
});

app.post('/api/chats/nuevo', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Falta userId' });

  const chats = leerChats();
  const id = 'chat_' + Date.now();
  chats[id] = {
    userId,
    titulo: 'Nuevo Chat',
    mensajes: [SYSTEM_INSTRUCTION]
  };
  guardarChats(chats);
  res.json({ id, titulo: chats[id].titulo });
});

app.get('/api/chats/:id', (req, res) => {
  const { userId } = req.query;
  const chats = leerChats();
  const chat = chats[req.params.id];
  
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: 'Chat no encontrado' });
  }
  
  const mensajesVisibles = chat.mensajes.filter(m => m.role !== 'system');
  res.json({ titulo: chat.titulo, mensajes: mensajesVisibles });
});

app.delete('/api/chats/:id', (req, res) => {
  const { userId } = req.query;
  const chats = leerChats();
  const chat = chats[req.params.id];

  if (chat && chat.userId === userId) {
    delete chats[req.params.id];
    guardarChats(chats);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Chat no encontrado' });
});

app.post('/api/chat', async (req, res) => {
  const { chatId, userId, message } = req.body;

  if (!message || !chatId || !userId) {
    return res.status(400).json({ error: "Faltan parámetros requeridos." });
  }

  const chats = leerChats();
  if (!chats[chatId] || chats[chatId].userId !== userId) {
    return res.status(404).json({ error: "El chat especificado no existe o no te pertenece." });
  }

  try {
    if (chats[chatId].titulo === 'Nuevo Chat') {
      chats[chatId].titulo = message.slice(0, 25) + (message.length > 25 ? '...' : '');
    }

    chats[chatId].mensajes.push({ role: 'user', content: message });

    const completion = await groq.chat.completions.create({
  messages: chats[chatId].mensajes,
  model: 'llama-3.3-70b-versatile',
});

    const respuestaIA = completion.choices[0]?.message?.content || "Sin respuesta";

    chats[chatId].mensajes.push({ role: 'assistant', content: respuestaIA });
    guardarChats(chats);

    res.json({ reply: respuestaIA, titulo: chats[chatId].titulo });
  } catch (error) {
    console.error("❌ Error en Groq:", error);
    res.status(500).json({ error: "Ocurrió un error al procesar el mensaje con Groq." });
  }
});

// 3. Arrancar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});