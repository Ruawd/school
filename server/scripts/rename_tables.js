const mysql = require('mysql2/promise');
require('dotenv').config();

async function renameTables() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database: process.env.DB_NAME
    });

    try {
        const [tables] = await connection.query('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        if (tableNames.includes('sys_users')) {
            await connection.query('RENAME TABLE sys_users TO users');
            console.log('Renamed sys_users to users');
        }
        if (tableNames.includes('biz_venues')) {
            await connection.query('RENAME TABLE biz_venues TO venues');
            console.log('Renamed biz_venues to venues');
        }
        if (tableNames.includes('biz_reservations')) {
            await connection.query('RENAME TABLE biz_reservations TO reservations');
            console.log('Renamed biz_reservations to reservations');
        }

        console.log('Migration completed.');
    } catch (err) {
        console.error('Error renaming tables:', err);
    } finally {
        await connection.end();
    }
}

renameTables();
