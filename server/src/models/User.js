const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
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
            const hashedPassword = await bcrypt.hash(userData.password, 10);
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
                    10,
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
};

module.exports = UserModel;
