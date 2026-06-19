const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const database = require('../config/database');

class User {
    constructor(data) {
        this.username = data.username;
        this.password = data.password;
        this.fullName = data.fullName;
        this.role = data.role || 'Engineer';
        this.createdAt = data.createdAt || new Date();
        this.updatedAt = data.updatedAt || new Date();
    }
}

const UserModel = {
    async getCollection(collectionName) {
        const db = database.getDatabase();
        return db.collection(collectionName);
    },
    // CREATE - Tạo user mới
    async create(userData) {
        try {
            const users = await this.getCollection('users');

            // Kiểm tra username đã tồn tại chưa
            const existingUser = await users.findOne({
                username: userData.username,
            });
            if (existingUser) {
                throw new Error('Username already exists');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(userData.password, 12);
            userData.password = hashedPassword;

            const user = new User(userData);
            const result = await users.insertOne(user);
            return { ...user, _id: result.insertedId };
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy user theo ID
    async findById(userId) {
        try {
            const users = await this.getCollection('users');
            return await users.findOne({ _id: new ObjectId(userId) });
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy user theo username
    async findByUsername(username) {
        try {
            const users = await this.getCollection('users');
            return await users.findOne({ username });
        } catch (error) {
            throw error;
        }
    },

    async findByLoraUsername(loraUsername) {
        try {
            const users = await this.getCollection('users');
            return await users.findOne({ loraUsername });
        } catch (error) {
            throw error;
        }
    },

    // READ - Lấy tất cả users
    async findAll(filter = {}, options = {}) {
        try {
            const users = await this.getCollection('users');
            const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
            const skip = (page - 1) * limit;

            const data = await users
                .find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .toArray();

            const total = await users.countDocuments(filter);

            return {
                data,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            throw error;
        }
    },

    // UPDATE - Cập nhật user
    async update(userId, updateData) {
        try {
            const users = await this.getCollection('users');

            // Nếu có password mới thì hash
            if (updateData.password) {
                updateData.password = await bcrypt.hash(
                    updateData.password,
                    12,
                );
            }

            updateData.updatedAt = new Date();

            const result = await users.updateOne(
                { _id: new ObjectId(userId) },
                { $set: updateData },
            );

            return result;
        } catch (error) {
            throw error;
        }
    },

    // DELETE - Xóa user
    async delete(userId) {
        try {
            const users = await this.getCollection('users');
            const result = await users.deleteOne({ _id: new ObjectId(userId) });
            return result;
        } catch (error) {
            throw error;
        }
    },

    // VERIFY - Xác thực password
    async verifyPassword(password, hashedPassword) {
        try {
            return await bcrypt.compare(password, hashedPassword);
        } catch (error) {
            throw error;
        }
    },

    // COUNT - Đếm số lượng users
    async count(filter = {}) {
        try {
            const users = await this.getCollection('users');
            return await users.countDocuments(filter);
        } catch (error) {
            throw error;
        }
    },

    async updateActiveStatus(userId, isActive, activeUntil) {
        const users = await this.getCollection('users');
        const upd = { isActive, updatedAt: new Date() };
        if (activeUntil !== undefined) upd.activeUntil = activeUntil;
        await users.updateOne(
            { _id: new ObjectId(userId) },
            { $set: upd },
        );
    },

    async incrementLoginCount(userId) {
        const users = await this.getCollection('users');
        await users.updateOne(
            { _id: new ObjectId(userId) },
            { $inc: { loginCount: 1 }, $set: { updatedAt: new Date() } },
        );
    },

    async setRefreshToken(userId, token) {
        const users = await this.getCollection('users');
        const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await users.updateOne(
            { _id: new ObjectId(userId) },
            { $set: { refreshToken: token, refreshTokenExpiresAt, updatedAt: new Date() } },
        );
    },

    async findByRefreshToken(token) {
        const users = await this.getCollection('users');
        return users.findOne({ refreshToken: token, refreshTokenExpiresAt: { $gt: new Date() } });
    },

    async clearRefreshToken(userId) {
        const users = await this.getCollection('users');
        await users.updateOne(
            { _id: new ObjectId(userId) },
            { $unset: { refreshToken: '' }, $set: { updatedAt: new Date() } },
        );
    },

    // Upsert user theo loraUsername (dùng bởi webhook UserBL.SyncUserToViPower
    // và job đồng bộ định kỳ từ SQL Server). Tự fallback khi đụng unique
    // index 'username' (account cũ chưa có loraUsername).
    async upsertFromLora({ loraUsername, fullName, role }) {
        const users = await this.getCollection('users');
        const crypto = require('crypto');
        const now = new Date();

        const setFields = { role, updatedAt: now };
        if (fullName !== undefined && fullName !== null) {
            setFields.fullName = fullName;
        }

        const randomPassword = crypto.randomBytes(24).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 12);

        const setOnInsertFields = {
            username: loraUsername,
            loraUsername,
            password: hashedPassword,
            isActive: false,
            loginCount: 0,
            createdAt: now,
        };
        if (setFields.fullName === undefined) {
            setOnInsertFields.fullName = fullName || loraUsername;
        }

        try {
            const result = await users.findOneAndUpdate(
                { loraUsername },
                { $set: setFields, $setOnInsert: setOnInsertFields },
                { upsert: true, returnDocument: 'before' },
            );
            return { action: (result === null || !result) ? 'created' : 'updated' };
        } catch (err) {
            if (err.code === 11000) {
                // Existing account created before loraUsername linking — attach it instead of inserting a duplicate.
                await users.updateOne({ username: loraUsername }, { $set: { ...setFields, loraUsername } });
                return { action: 'updated' };
            }
            throw err;
        }
    },
};

module.exports = UserModel;
