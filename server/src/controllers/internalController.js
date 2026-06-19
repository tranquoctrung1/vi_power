const crypto = require('crypto');
const UserModel = require('../models/User');

function mapRole(loraRole) {
    return loraRole === 'admin' ? 'Admin' : 'Viewer';
}

const internalController = {
    async syncUser(req, res) {
        const secret = req.headers['x-internal-secret'];
        const expected = process.env.INTERNAL_SECRET || '';
        if (!secret || !expected || secret.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(expected))) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { loraUsername, fullName, role } = req.body;

        if (!loraUsername || !role) {
            return res.status(400).json({ success: false, message: 'loraUsername and role required' });
        }

        try {
            const { action } = await UserModel.upsertFromLora({
                loraUsername,
                fullName,
                role: mapRole(role),
            });

            const statusCode = action === 'created' ? 201 : 200;
            return res.status(statusCode).json({
                success: true,
                message: action === 'created' ? 'User created' : 'User updated',
                action,
            });
        } catch (err) {
            console.error('[syncUser] error:', err);
            return res.status(500).json({ success: false, message: err.message });
        }
    },
};

module.exports = internalController;
