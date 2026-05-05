'use strict';
/**
 * Ensures the default admin account exists.
 * Called once at server startup — safe to run repeatedly (idempotent).
 */
const UserModel = require('../models/User');

async function seedAdmin() {
    const username = 'bavitech';
    try {
        const existing = await UserModel.findByUsername(username);
        if (existing) return;

        await UserModel.create({
            username,
            password: 'Bvt@23ptb',
            fullName: 'BaViTech Admin',
            role:     'Admin',
        });
        console.log(`✅ Default admin "${username}" created`);
    } catch (err) {
        console.error(`❌ seedAdmin failed: ${err.message}`);
    }
}

module.exports = seedAdmin;
