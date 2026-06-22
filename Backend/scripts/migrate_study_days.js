// Run this once to apply the study_days migration
require('dotenv').config();
const db = require('../src/config/db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    const sql = fs.readFileSync(
        path.join(__dirname, '../../Backend/Database/migration_study_days.sql'),
        'utf8'
    );
    try {
        await db.query(sql);
        console.log('✅ study_days table created successfully');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
