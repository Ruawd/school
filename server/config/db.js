const { Sequelize } = require('sequelize');
require('dotenv').config({ quiet: true });

process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Shanghai';

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false,
        timezone: '+08:00',
        define: {
            timestamps: true,
            createdAt: 'create_time',
            updatedAt: 'update_time',
            underscored: true
        }
    }
);

module.exports = sequelize;
