import pg from 'pg';

const { Pool } = pg;

// Create direct PostgreSQL connection pool
// This bypasses Supabase REST API which has been timing out
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Database connection established');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
});

export default pool;
