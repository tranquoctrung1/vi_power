const { ObjectId } = require('mongodb');
const database = require('../config/database');

class DisplayGroup {
    constructor(data) {
        this.displaygrouid = data.displaygrouid;
        this.name = data.name;
        this.note = data.note || '';
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
    }
}

const DisplayGroupModel = {
    async getCollection(collectionName) {
        const db = database.getDatabase();
        return db.collection(collectionName);
    },
    // CREATE
    async create(groupData) {
        try {
            const groups = await this.getCollection('displaygroup');

            const existingGroup = await groups.findOne({
                displaygrouid: groupData.displaygrouid,
            });
            if (existingGroup) {
                throw new Error('Group ID already exists');
            }

            const group = new DisplayGroup(groupData);
            const result = await groups.insertOne(group);
            return { ...group, _id: result.insertedId };
        } catch (error) {
            throw error;
        }
    },

    // READ by ID
    async findById(groupId) {
        try {
            const groups = await this.getCollection('displaygroup');
            return await groups.findOne({ _id: new ObjectId(groupId) });
        } catch (error) {
            throw error;
        }
    },

    // READ by displaygrouid
    async findByGroupId(displaygrouid) {
        try {
            const groups = await this.getCollection('displaygroup');
            return await groups.findOne({ displaygrouid });
        } catch (error) {
            throw error;
        }
    },

    // READ all
    async findAll(filter = {}) {
        try {
            const groups = await this.getCollection('displaygroup');
            return await groups.find(filter).toArray();
        } catch (error) {
            throw error;
        }
    },

    // UPDATE
    async update(groupId, updateData) {
        try {
            const groups = await this.getCollection('displaygroup');

            updateData.updatedAt = new Date();

            const result = await groups.updateOne(
                { _id: new ObjectId(groupId) },
                { $set: updateData },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // DELETE
    async delete(groupId) {
        try {
            const groups = await this.getCollection('displaygroup');
            const result = await groups.deleteOne({
                _id: new ObjectId(groupId),
            });
            return result;
        } catch (error) {
            throw error;
        }
    },
};

module.exports = DisplayGroupModel;
