const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const database = require('../config/database');

function mapRole(loraRole) {
    return loraRole === 'admin' ? 'Admin' : 'Viewer';
}

const internalController = {
    async syncUser(req, res) {
        const secret = req.headers['x-internal-secret'];
        if (!secret || secret !== process.env.INTERNAL_SECRET) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { loraUsername, fullName, role, action } = req.body;

        if (!loraUsername || !role) {
            return res.status(400).json({ success: false, message: 'loraUsername and role required' });
        }

        try {
            const db = database.getDatabase();
            const users = db.collection('users');

            const existingUser = await users.findOne({ loraUsername });

            const viPowerRole = mapRole(role);
            const now = new Date();

            if (existingUser) {
                await users.updateOne(
                    { loraUsername },
                    {
                        $set: {
                            fullName: fullName || existingUser.fullName,
                            role: viPowerRole,
                            updatedAt: now,
                        },
                    },
                );
                return res.json({ success: true, message: 'User updated', action: 'updated' });
            }

            // Create new user — password is random since login is SSO-only
            const randomPassword = crypto.randomBytes(24).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 12);

            await users.insertOne({
                username: loraUsername,
                loraUsername,
                password: hashedPassword,
                fullName: fullName || loraUsername,
                role: viPowerRole,
                isActive: false,
                loginCount: 0,
                createdAt: now,
                updatedAt: now,
            });

            return res.status(201).json({ success: true, message: 'User created', action: 'created' });
        } catch (err) {
            console.error('[syncUser] error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },
};

module.exports = internalController;
