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

const ANIO_ACTUAL = new Date().getFullYear();

const SYSTEM_INSTRUCTION = {
  role: 'system',
  content: `Eres IAvel, un asistente virtual inteligente. Hoy es ${ANIO_ACTUAL}. Cuando el usuario pregunte por eventos, noticias o datos recientes, debes basarte estrictamente en la información de búsqueda web que se te proporciona a continuación y responder de forma directa y actualizada.`
};

function requiereBusquedaWeb(mensaje) {
  const texto = mensaje.toLowerCase();
  const palabrasClave = [
    'hoy', 'noticia', 'noticias', 'reciente', 'actual', 'ahora',
    'quien gano', 'resultado', 'precio', 'clima', 'tiempo',
    'quien es', 'presidente', 'estrenos', 'dolar', '2025', '2026'
  ];
  return palabrasClave.some(p => texto.includes(p)) || texto.includes('?') || texto.length > 5;
}

async function buscarEnWeb(query) {
  try {
    const searchResults = await search(query, { safeSearch: 0 });
    if (searchResults && searchResults.results.length > 0) {
      const topResults = searchResults.results.slice(0, 3);
      return topResults.map(r => `- [${r.title}](${r.url}): ${r.snippet}`).join('\n');
    }
  } catch (error) {
    console.error("Error al buscar en la web:", error);
  }
  return null;
}

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

    // Copia temporal de los mensajes del chat para inyectar la búsqueda web sin alterar el historial visible
    let mensajesParaGroq = [...chats[chatId].mensajes];

    if (requiereBusquedaWeb(message)) {
      const resultadosWeb = await buscarEnWeb(message);
      if (resultadosWeb) {
        mensajesParaGroq.push({
          role: 'system',
          content: `[Resultados de búsqueda web actualizados para la consulta]:\n${resultadosWeb}`
        });
      }
    }

    mensajesParaGroq.push({ role: 'user', content: message });

    // Petición a Groq usando el modelo Llama 3.3 Versatile (soporta excelente contexto web)
    const completion = await groq.chat.completions.create({
      messages: mensajesParaGroq,
      model: 'llama-3.3-70b-versatile',
    });

    const respuestaIA = completion.choices[0]?.message?.content || "Sin respuesta";

    // Guardar en el historial permanente solo el mensaje real del usuario y la respuesta de la IA
    chats[chatId].mensajes.push({ role: 'user', content: message });
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