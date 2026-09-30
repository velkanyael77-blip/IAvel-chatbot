// Obtener chats del usuario
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

// Crear un nuevo chat asignado al usuario
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

// Obtener mensajes de un chat específico (si pertenece al usuario)
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

// Eliminar un chat (si pertenece al usuario)
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

// Enviar mensaje
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
      model: 'openai/gpt-oss-20b',
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