import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CHATS_FILE = path.join(__dirname, 'chats.json');

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
  content: 'Eres IAvel, un asistente virtual útil, atento, amigable y muy inteligente.'
};

// --- RUTAS API CON AISLAMIENTO DE USUARIO ---

// 1. Obtener únicamente los chats pertenecientes a este userId
app.get('/api/chats', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json([]);

  const chats = leerChats();
  
  const lista = Object.keys(chats)
    .filter(id => chats[id].userId === userId)
    .map(id => ({
      id,
      titulo: chats[id].titulo || 'Nuevo Chat'
    }));
    
  res.json(lista);
});

// 2. Crear un nuevo chat asignado al userId del cliente
app.post('/api/chats/nuevo', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Falta identificador de usuario (userId).' });

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

// 3. Obtener conversación si pertenece al userId
app.get('/api/chats/:id', (req, res) => {
  const userId = req.query.userId;
  const chats = leerChats();
  const chat = chats[req.params.id];
  
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: 'Chat no encontrado o no autorizado.' });
  }
  
  const mensajesVisibles = chat.mensajes.filter(m => m.role !== 'system');
  res.json({ titulo: chat.titulo, mensajes: mensajesVisibles });
});

// 4. Eliminar chat si pertenece al userId
app.delete('/api/chats/:id', (req, res) => {
  const userId = req.query.userId;
  const chats = leerChats();
  const chat = chats[req.params.id];

  if (chat && chat.userId === userId) {
    delete chats[req.params.id];
    guardarChats(chats);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Chat no encontrado.' });
});

// 5. Enviar mensaje a Groq
app.post('/api/chat', async (req, res) => {
  const { chatId, userId, message } = req.body;

  if (!message || !chatId || !userId) {
    return res.status(400).json({ error: "Faltan parámetros de mensaje o usuario." });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en las variables de entorno de Render." });
  }

  const chats = leerChats();

  if (!chats[chatId] || chats[chatId].userId !== userId) {
    return res.status(404).json({ error: "El chat no pertenece a este usuario." });
  }

  try {
    if (chats[chatId].titulo === 'Nuevo Chat') {
      chats[chatId].titulo = message.slice(0, 25) + (message.length > 25 ? '...' : '');
    }

    chats[chatId].mensajes.push({ role: 'user', content: message });

    // Petición a Groq con el modelo activo en producción
    const completion = await groq.chat.completions.create({
      messages: chats[chatId].mensajes,
      model: 'openai/gpt-oss-20b',
    });

    const respuestaIA = completion.choices[0]?.message?.content || "Sin respuesta";

    chats[chatId].mensajes.push({ role: 'assistant', content: respuestaIA });
    guardarChats(chats);

    res.json({ reply: respuestaIA, titulo: chats[chatId].titulo });
  } catch (error) {
    console.error("❌ Error en Groq:", error);
    res.status(500).json({ error: error.message || "Error al procesar el mensaje." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor IAvel ejecutándose en el puerto ${PORT}`);
});