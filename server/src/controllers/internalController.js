const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const database = require('../config/database');

function mapRole(loraRole) {
    return loraRole === 'admin' ? 'Admin' : 'Viewer';
}

const internalController = {
    async syncUser(req, res) {
        // Fix 2: timing-safe secret comparison + empty INTERNAL_SECRET guard
        const secret = req.headers['x-internal-secret'];
        const expected = process.env.INTERNAL_SECRET || '';
        if (!secret || !expected || secret.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { loraUsername, fullName, role, action } = req.body;

        if (!loraUsername || !role) {
            return res.status(400).json({ success: false, message: 'loraUsername and role required' });
        }

        try {
            const db = database.getDatabase();
            const users = db.collection('users');

            // Fix 1: atomic upsert — eliminates TOCTOU race between findOne + insertOne
            const viPowerRole = mapRole(role);
            const now = new Date();

            // Fix 3: only set fullName on updates when it is explicitly provided (not null/undefined)
            const setFields = { role: viPowerRole, updatedAt: now };
            if (fullName !== undefined && fullName !== null) {
                setFields.fullName = fullName;
            }

            const randomPassword = crypto.randomBytes(24).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 12);

            const result = await users.findOneAndUpdate(
                { loraUsername },
                {
                    $set: setFields,
                    $setOnInsert: {
                        username: loraUsername,
                        loraUsername,
                        password: hashedPassword,
                        // Fix 3: fallback to loraUsername for new users when fullName is falsy
                        fullName: fullName || loraUsername,
                        isActive: false,
                        loginCount: 0,
                        createdAt: now,
                    },
                },
                { upsert: true, returnDocument: 'before' },
            );

            // findOneAndUpdate with returnDocument:'before' returns null on upsert (new insert)
            const actionTaken = (result === null || !result) ? 'created' : 'updated';
            const statusCode = actionTaken === 'created' ? 201 : 200;

            return res.status(statusCode).json({
                success: true,
                message: actionTaken === 'created' ? 'User created' : 'User updated',
                action: actionTaken,
            });
        } catch (err) {
            console.error('[syncUser] error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },
};

module.exports = internalController;
