import 'dotenv/config';
import express from 'express';
import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("❌ Error: No se encontró GROQ_API_KEY en el archivo .env");
  process.exit(1);
}

const groq = new Groq({ apiKey });
const DB_FILE = path.join(process.cwd(), 'chats.json');

// Leer datos desde chats.json
function leerChats() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({}), 'utf-8');
    return {};
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (error) {
    return {};
  }
}

// Guardar datos en chats.json
function guardarChats(chats) {
  fs.writeFileSync(DB_FILE, JSON.stringify(chats, null, 2), 'utf-8');
}

const SYSTEM_INSTRUCTION = {
  role: 'system',
  content: 'Te llamas IAvel. Eres un asistente virtual inteligente creado para este chat web. Tu motor principal es GPT-OSS procesado a través de Groq. Respondes en español de forma amable, concisa y útil. Bajo ninguna circunstancia te identifiques como ChatGPT ni como un modelo de OpenAI.'
};

// Obtener lista de todos los chats
app.get('/api/chats', (req, res) => {
  const chats = leerChats();
  const lista = Object.keys(chats).map(id => ({
    id,
    titulo: chats[id].titulo || 'Nuevo Chat'
  }));
  res.json(lista);
});

// Crear un nuevo chat
app.post('/api/chats/nuevo', (req, res) => {
  const chats = leerChats();
  const id = 'chat_' + Date.now();
  chats[id] = {
    titulo: 'Nuevo Chat',
    mensajes: [SYSTEM_INSTRUCTION]
  };
  guardarChats(chats);
  res.json({ id, titulo: chats[id].titulo });
});

// Obtener mensajes de un chat específico
app.get('/api/chats/:id', (req, res) => {
  const chats = leerChats();
  const chat = chats[req.params.id];
  if (!chat) return res.status(404).json({ error: 'Chat no encontrado' });
  
  const mensajesVisibles = chat.mensajes.filter(m => m.role !== 'system');
  res.json({ titulo: chat.titulo, mensajes: mensajesVisibles });
});

// Eliminar un chat
app.delete('/api/chats/:id', (req, res) => {
  const chats = leerChats();
  if (chats[req.params.id]) {
    delete chats[req.params.id];
    guardarChats(chats);
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Chat no encontrado' });
});

// Enviar un mensaje a un chat específico
app.post('/api/chat', async (req, res) => {
  const { chatId, message } = req.body;

  if (!message || !chatId) {
    return res.status(400).json({ error: "Faltan parámetros requeridos." });
  }

  const chats = leerChats();
  if (!chats[chatId]) {
    return res.status(404).json({ error: "El chat especificado no existe." });
  }

  try {
    // 1. Asignar título automático al primer mensaje
    if (chats[chatId].titulo === 'Nuevo Chat') {
      chats[chatId].titulo = message.slice(0, 25) + (message.length > 25 ? '...' : '');
    }

    // 2. Agregar mensaje del usuario
    chats[chatId].mensajes.push({ role: 'user', content: message });

    // 3. Consultar a Groq con el modelo activo openai/gpt-oss-20b
    const completion = await groq.chat.completions.create({
      messages: chats[chatId].mensajes,
      model: 'openai/gpt-oss-20b',
    });

    const respuestaIA = completion.choices[0]?.message?.content || "Sin respuesta";

    // 4. Guardar respuesta de la IA
    chats[chatId].mensajes.push({ role: 'assistant', content: respuestaIA });
    guardarChats(chats);

    res.json({ reply: respuestaIA, titulo: chats[chatId].titulo });
  } catch (error) {
    console.error("❌ Error en Groq:", error);
    res.status(500).json({ error: "Ocurrió un error al procesar el mensaje con Groq." });
  }
});

app.listen(port, () => {
  console.log(`🚀 Servidor ejecutándose en: http://localhost:${port}`);
});