const { ObjectId } = require('mongodb');
const crypto = require('crypto');
const database = require('../config/database');

const ApiKeyModel = {
  async getCollection() {
    return database.getDatabase().collection('api_keys');
  },

  generateKey() {
    return 'vpk_' + crypto.randomBytes(32).toString('hex');
  },

  async create(data) {
    const col = await this.getCollection();
    const doc = {
      name: data.name,
      key: this.generateKey(),
      createdBy: data.createdBy,
      permissions: data.permissions || ['read'],
      description: data.description || '',
      active: true,
      lastUsed: null,
      usageCount: 0,
      createdAt: new Date(),
    };
    const result = await col.insertOne(doc);
    return { ...doc, _id: result.insertedId };
  },

  async findAll() {
    const col = await this.getCollection();
    return col.find({}).sort({ createdAt: -1 }).toArray();
  },

  async findByKey(key) {
    const col = await this.getCollection();
    return col.findOne({ key, active: true });
  },

  async findById(id) {
    const col = await this.getCollection();
    return col.findOne({ _id: new ObjectId(id) });
  },

  async revoke(id) {
    const col = await this.getCollection();
    return col.updateOne({ _id: new ObjectId(id) }, { $set: { active: false, revokedAt: new Date() } });
  },

  async activate(id) {
    const col = await this.getCollection();
    return col.updateOne({ _id: new ObjectId(id) }, { $set: { active: true, revokedAt: null } });
  },

  async delete(id) {
    const col = await this.getCollection();
    return col.deleteOne({ _id: new ObjectId(id) });
  },

  async touch(id) {
    const col = await this.getCollection();
    return col.updateOne(
      { _id: new ObjectId(id) },
      { $set: { lastUsed: new Date() }, $inc: { usageCount: 1 } }
    );
  },
};

module.exports = ApiKeyModel;
