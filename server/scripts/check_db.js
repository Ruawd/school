require('dotenv').config({ quiet: true });

const sequelize = require('../config/db');

async function checkDB() {
  try {
    await sequelize.authenticate();
    console.log('Database connection passed.');
    process.exit(0);
  } catch (error) {
    console.error('Database connection failed.');
    console.error(error?.original?.message || error.message);
    process.exit(1);
  } finally {
    try {
      await sequelize.close();
    } catch (_) {
      // ignore close errors
    }
  }
}

checkDB();
