// src/config/db.js
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
require('dotenv').config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(client => {
    console.log('✅ Connected to Papyrus Cloud Database successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

// Handle idle pool background errors to prevent app crashes and credential leaks.
// By default 'pg' drivers emit 'error' on the pool. If unattended, it crashes Node
// and dumps the entire error object which contains the connection credentials!
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle database client:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};