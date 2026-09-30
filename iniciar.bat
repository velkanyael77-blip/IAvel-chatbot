@echo off
title Servidor Mi Chatbot IA
echo ====================================
echo  Iniciando el servidor del Chatbot...
echo ====================================
echo.

:: 1. Ir a la carpeta del proyecto
cd /d "%~dp0"

:: 2. Abrir el navegador automaticamente
start http://localhost:3000

:: 3. Arrancar el servidor Node.js
node server.js