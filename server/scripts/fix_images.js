const path = require('path');
const Venue = require('../models/Venue');
const sequelize = require('../config/db');

async function fix() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const venues = await Venue.findAll();
        console.log(`Checking ${venues.length} venues...`);

        for (const venue of venues) {
            let url = venue.image_url;
            if (!url) continue;

            console.log(`Original: ${url}`);

            // 1. Replace backslashes with forward slashes
            url = url.replace(/\\/g, '/');

            // 2. Extract relative path if it's absolute (either localhost or file path)
            const match = url.match(/\/uploads\/.*$/);
            if (match) {
                url = match[0];
            } else if (url.includes('uploads/') && !url.startsWith('/uploads/')) {
                // Handle cases like 'uploads/xxx.jpg' -> '/uploads/xxx.jpg'
                url = '/uploads/' + url.split('uploads/')[1];
            }

            if (url !== venue.image_url) {
                console.log(`Updated to: ${url}`);
                await venue.update({ image_url: url });
            }
        }

        console.log('Fix complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fix();
