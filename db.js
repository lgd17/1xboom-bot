require('dotenv').config();
const { Pool } = require('pg');
const dns = require('dns').promises;

async function createPool() {
  const dbUrl = new URL(process.env.DATABASE_URL);
  const host = dbUrl.hostname;

  const ipv4Addresses = await dns.resolve4(host); // 👈 force IPv4

  const ipv4Url = process.env.DATABASE_URL.replace(host, ipv4Addresses[0]);

  return new Pool({
    connectionString: ipv4Url,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

module.exports = {
  pool: await createPool()
};