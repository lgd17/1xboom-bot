// testdb.js
require('dotenv').config();
const { pool } = require('./db');

pool.query('SELECT NOW()')
  .then(res => {
    console.log("✅ Connexion réussie :", res.rows[0]);
    pool.end();
  })
  .catch(err => {
    console.error("❌ Erreur PostgreSQL :", err);
    pool.end();
  });
