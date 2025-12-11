const { ObjectId } = require('mongodb');
const database = require('../config/database');

class UserGroup {
    constructor(data) {
        this.displaygrouid = data.displaygrouid;
        this.username = data.username;
        this.createdAt = data.createdAt || new Date();
    }
}

const UserGroupModel = {
    async getCollection(collectionName) {
        const db = database.getDatabase();
        return db.collection(collectionName);
    },
    // CREATE - Thêm user vào group
    async create(userGroupData) {
        try {
            const userGroups = await this.getCollection('user_group');

            // Kiểm tra đã tồn tại chưa
            const existing = await userGroups.findOne({
                displaygrouid: userGroupData.displaygrouid,
                username: userGroupData.username,
            });

            if (existing) {
                throw new Error('User already in this group');
            }

            const userGroup = new UserGroup(userGroupData);
            const result = await userGroups.insertOne(userGroup);
            return { ...userGroup, _id: result.insertedId };
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy user groups theo username
    async findByUsername(username) {
        try {
            const userGroups = await this.getCollection('user_group');
            return await userGroups.find({ username }).toArray();
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy users theo group
    async findByGroupId(displaygrouid) {
        try {
            const userGroups = await this.getCollection('user_group');
            return await userGroups.find({ displaygrouid }).toArray();
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy tất cả user groups
    async findAll(filter = {}) {
        try {
            const userGroups = await this.getCollection('user_group');
            return await userGroups.find(filter).toArray();
        } catch (error) {
            throw error;
        }
    },

    // DELETE - Xóa user khỏi group
    async delete(userGroupId) {
        try {
            const userGroups = await this.getCollection('user_group');
            const result = await userGroups.deleteOne({
                _id: new ObjectId(userGroupId),
            });
            return result;
        } catch (error) {
            throw error;
        }
    },

    // DELETE - Xóa user khỏi group theo username và groupid
    async deleteByUserAndGroup(username, displaygrouid) {
        try {
            const userGroups = await this.getCollection('user_group');
            const result = await userGroups.deleteOne({
                username,
                displaygrouid,
            });
            return result;
        } catch (error) {
            throw error;
        }
    },

    // Kiểm tra user có trong group không
    async isUserInGroup(username, displaygrouid) {
        try {
            const userGroups = await this.getCollection('user_group');
            const result = await userGroups.findOne({
                username,
                displaygrouid,
            });
            return result !== null;
        } catch (error) {
            throw error;
        }
    },
};

module.exports = UserGroupModel;
