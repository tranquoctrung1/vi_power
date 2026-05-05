const ApiKeyModel = require('../models/ApiKey');

const apiKeyController = {
  // GET /api/auth/api-keys — list all (admin only, keys masked)
  getAll: async (req, res) => {
    try {
      const keys = await ApiKeyModel.findAll();
      const masked = keys.map(k => ({
        ...k,
        key: k.key.slice(0, 12) + '••••••••',
      }));
      res.json({ success: true, data: masked });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // POST /api/auth/api-keys — create new (admin only, returns full key ONCE)
  create: async (req, res) => {
    try {
      const { name, description, permissions } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }
      const validPerms = ['read', 'write', 'admin'];
      const perms = (permissions || ['read']).filter(p => validPerms.includes(p));

      const keyDoc = await ApiKeyModel.create({
        name: name.trim(),
        description: (description || '').trim(),
        permissions: perms,
        createdBy: req.user.username,
      });
      res.json({ success: true, data: keyDoc, message: 'Lưu API key này ngay — không thể xem lại sau khi đóng trang' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // PATCH /api/auth/api-keys/:id/revoke
  revoke: async (req, res) => {
    try {
      await ApiKeyModel.revoke(req.params.id);
      res.json({ success: true, message: 'API key revoked' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // PATCH /api/auth/api-keys/:id/activate
  activate: async (req, res) => {
    try {
      await ApiKeyModel.activate(req.params.id);
      res.json({ success: true, message: 'API key activated' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },

  // DELETE /api/auth/api-keys/:id
  delete: async (req, res) => {
    try {
      await ApiKeyModel.delete(req.params.id);
      res.json({ success: true, message: 'API key deleted' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  },
};

module.exports = apiKeyController;
