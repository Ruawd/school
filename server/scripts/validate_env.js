require('dotenv').config({ quiet: true });

const required = ['PORT', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET'];

const missing = required.filter((key) => !String(process.env[key] ?? '').trim());
if (missing.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log('Env validation passed.');
