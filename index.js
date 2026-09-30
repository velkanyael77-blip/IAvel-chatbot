import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import readline from 'readline';

// 1. Verificar la API Key
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ Error: No se encontró GEMINI_API_KEY en el archivo .env");
  process.exit(1);
}

// 2. Inicializar Gemini
const ai = new GoogleGenAI({ apiKey });

// 3. Crear una sesión de Chat
// ai.chats.create guarda el historial automáticamente
const chat = ai.chats.create({
  model: 'gemini-3.8-flash',
  config: {
    systemInstruction: "Eres un asistente amable y conciso. Respondes en español.",
  }
});

// Configuración para leer entradas del usuario desde la terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log("🤖 Chatbot iniciado. Escribe tu mensaje (o escribe 'salir' para terminar):\n");

function preguntar() {
  rl.question('Tú: ', async (mensajeUsuario) => {
    // Si el usuario escribe "salir", cerramos el programa
    if (mensajeUsuario.trim().toLowerCase() === 'salir') {
      console.log('\n👋 ¡Hasta luego!');
      rl.close();
      return;
    }

    try {
      // 4. Enviar el mensaje al chat (mantiene el contexto del historial automáticamente)
      const response = await chat.sendMessage({
        message: mensajeUsuario
      });

      console.log(`\n🤖 Gemini: ${response.text}\n`);
    } catch (error) {
      console.error("❌ Error al enviar el mensaje:", error);
    }

    // Volver a pedir otra entrada
    preguntar();
  });
}

// Iniciar el ciclo de preguntas
preguntar();