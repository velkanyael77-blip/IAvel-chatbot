import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Groq from 'groq-sdk';
import { search } from 'duck-duck-scrape';

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
  content: 'Eres IAvel, un asistente virtual basado en inteligencia artificial. Recuerda responder con cortesía, claridad y concisión utilizando formato Markdown cuando corresponda.'
};

// Función para verificar si la pregunta requiere información en tiempo real
function requiereBusquedaWeb(mensaje) {
  const texto = mensaje.toLowerCase();
  const palabrasClave = [
    'hoy', 'noticia', 'noticias', 'reciente', 'actual', 'ahora',
    'quien gano', 'resultado', 'precio', 'clima', 'tiempo', '2025', '2026',
    'donde esta', 'quien es el presidente', 'estrenos', 'dolar'
  ];
  return palabrasClave.some(p => texto.includes(p));
}

// Búsqueda ultra-rápida (limitada a 2 resultados clave)
async function buscarEnWeb(query) {
  try {
    const searchResults = await search(query, { safeSearch: 0 });
    if (searchResults && searchResults.results.length > 0) {
      const topResults = searchResults.results.slice(0, 2);
      return topResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n');
    }
  } catch (error) {
    console.error("Error en búsqueda web rápida:", error);
  }
  return null;
}

// --- RUTAS API ---

app.get('/api/chats', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.json([]);

  const chats = leerChats();
  const lista = Object.keys(chats)
    .filter(id => chats[id].userId === userId)
    .map(id => ({ id, titulo: chats[id].titulo || 'Nuevo Chat' }));
    
  res.json(lista);
});

app.post('/api/chats/nuevo', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Falta userId.' });

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
  const userId = req.query.userId;
  const chats = leerChats();
  const chat = chats[req.params.id];
  
  if (!chat || chat.userId !== userId) {
    return res.status(404).json({ error: 'Chat no encontrado.' });
  }
  
  const mensajesVisibles = chat.mensajes.filter(m => m.role !== 'system');
  res.json({ titulo: chat.titulo, mensajes: mensajesVisibles });
});

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

app.post('/api/chat', async (req, res) => {
  const { chatId, userId, message } = req.body;

  if (!message || !chatId || !userId) {
    return res.status(400).json({ error: "Faltan datos requeridos." });
  }

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "Falta configurar GROQ_API_KEY en Render." });
  }

  const chats = leerChats();

  if (!chats[chatId] || chats[chatId].userId !== userId) {
    return res.status(404).json({ error: "El chat no pertenece a este usuario." });
  }

  try {
    if (chats[chatId].titulo === 'Nuevo Chat') {
      chats[chatId].titulo = message.slice(0, 25) + (message.length > 25 ? '...' : '');
    }

    let mensajeProcesado = message;

    // Solo buscar en la web si el mensaje lo necesita
    if (requiereBusquedaWeb(message)) {
      const resultadosWeb = await buscarEnWeb(message);
      if (resultadosWeb) {
        mensajeProcesado = `[Datos de búsqueda web actualizados]:\n${resultadosWeb}\n\nPregunta: ${message}`;
      }
    }

    chats[chatId].mensajes.push({ role: 'user', content: mensajeProcesado });

    // Consulta veloz con el modelo openai/gpt-oss-20b
    const completion = await groq.chat.completions.create({
      messages: chats[chatId].mensajes,
      model: 'openai/gpt-oss-20b',
    });

    const respuestaIA = completion.choices[0]?.message?.content || "Sin respuesta";

    // Restaurar mensaje limpio para el historial
    chats[chatId].mensajes[chats[chatId].mensajes.length - 1].content = message;
    chats[chatId].mensajes.push({ role: 'assistant', content: respuestaIA });
    guardarChats(chats);

    res.json({ reply: respuestaIA, titulo: chats[chatId].titulo });
  } catch (error) {
    console.error("❌ Error en backend:", error);
    res.status(500).json({ error: error.message || "Error al procesar el mensaje." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor IAvel ejecutándose en el puerto ${PORT}`);
});