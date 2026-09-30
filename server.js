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

// Inicialización de Groq con la API Key
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

// --- RUTAS DEL API ---

// 1. Obtener lista de chats del usuario
app.get('/api/chats', (req, res) => {
  const userId = req.query.userId || 'default_user';
  const chats = leerChats();
  
  const lista = Object.keys(chats)
    .filter(id => chats[id].userId === userId || !chats[id].userId)
    .map(id => ({
      id,
      titulo: chats[id].titulo || 'Nuevo Chat'
    }));
    
  res.json(lista);
});

// 2. Crear un nuevo chat
app.post('/api/chats/nuevo', (req, res) => {
  const userId = req.body.userId || 'default_user';
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

// 3. Obtener conversación específica
app.get('/api/chats/:id', (req, res) => {
  const userId = req.query.userId || 'default_user';
  const chats = leerChats();
  const chat = chats[req.params.id];
  
  if (!chat) {
    return res.status(404).json({ error: 'Chat no encontrado' });
  }
  
  const mensajesVisibles = chat.mensajes.filter(m => m.role !== 'system');
  res.json({ titulo: chat.titulo, mensajes: mensajesVisibles });
});

// 4. Eliminar un chat
app.delete('/api/chats/:id', (req, res) => {
  const chats = leerChats();
  if (chats[req.params.id]) {
    delete chats[req.params.id];
    guardarChats(chats);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Chat no encontrado' });
});

// 5. Enviar mensaje a la IA (Groq)
app.post('/api/chat', async (req, res) => {
  const { chatId, userId, message } = req.body;

  if (!message || !chatId) {
    return res.status(400).json({ error: "Faltan datos requeridos." });
  }

  const chats = leerChats();

  // Si el chat no existe, lo creamos automáticamente
  if (!chats[chatId]) {
    chats[chatId] = {
      userId: userId || 'default_user',
      titulo: 'Nuevo Chat',
      mensajes: [SYSTEM_INSTRUCTION]
    };
  }

  try {
    // Actualizar título con los primeros caracteres del primer mensaje
    if (chats[chatId].titulo === 'Nuevo Chat') {
      chats[chatId].titulo = message.slice(0, 25) + (message.length > 25 ? '...' : '');
    }

    // Agregar mensaje del usuario a la historia
    chats[chatId].mensajes.push({ role: 'user', content: message });

 const completion = await groq.chat.completions.create({
      messages: chats[chatId].mensajes,
      model: 'llama-3.3-70b-versatile',
    });

    const respuestaIA = completion.choices[0]?.message?.content || "No pude generar una respuesta.";

    // Guardar respuesta de la IA
    chats[chatId].mensajes.push({ role: 'assistant', content: respuestaIA });
    guardarChats(chats);

    res.json({ reply: respuestaIA, titulo: chats[chatId].titulo });
  } catch (error) {
    console.error("❌ Error en backend Groq:", error);
    res.status(500).json({ error: "Error en el servidor de IA. Revisa la consola o tu GROQ_API_KEY." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor IAvel ejecutándose en el puerto ${PORT}`);
});