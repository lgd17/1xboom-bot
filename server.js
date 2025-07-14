// server.js
// server.js
require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Pour vérifier que le serveur tourne
app.get('/', (req, res) => {
  res.send('✅ Serveur du bot en ligne');
});

// Tu peux aussi ajouter d'autres routes ici (ex: /webhook, /generate, etc.)

app.listen(PORT, () => {
  console.log(`🚀 Serveur API lancé sur http://localhost:${PORT}`);
});
