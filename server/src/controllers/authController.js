const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');

const authController = {
    // Đăng nhập
    async login(req, res) {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required',
                });
            }

            // Tìm user theo username
            const user = await UserModel.findByUsername(username);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            // Xác thực password
            const isValidPassword = await UserModel.verifyPassword(
                password,
                user.password,
            );

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid credentials',
                });
            }

            // Tạo JWT token
            const token = jwt.sign(
                {
                    userId: user._id,
                    username: user.username,
                    role: user.role,
                },
                process.env.JWT_SECRET,
                { expiresIn: '24h' },
            );

            // Trả về thông tin user (không bao gồm password)
            const userResponse = {
                _id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                createdAt: user.createdAt,
            };

            res.json({
                success: true,
                message: 'Login successful',
                token,
                user: userResponse,
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                message: 'Login failed',
            });
        }
    },

    // Đăng ký user mới (chỉ Admin)
    async register(req, res) {
        try {
            const userData = req.body;

            // Kiểm tra quyền Admin
            if (req.user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Admin can register new users',
                });
            }

            // Tạo user mới
            const user = await UserModel.create(userData);

            // Trả về thông tin (không bao gồm password)
            const userResponse = {
                _id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                createdAt: user.createdAt,
            };

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: userResponse,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy thông tin user hiện tại
    async getCurrentUser(req, res) {
        try {
            const user = req.user;

            // Trả về thông tin user (không bao gồm password)
            const userResponse = {
                _id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                createdAt: user.createdAt,
            };

            res.json({
                success: true,
                data: userResponse,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to get user information',
            });
        }
    },

    // Đổi password
    async changePassword(req, res) {
        try {
            const { currentPassword, newPassword } = req.body;
            const userId = req.user._id;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password and new password are required',
                });
            }

            // Lấy user từ database
            const user = await UserModel.findById(userId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Xác thực password hiện tại
            const isValidPassword = await UserModel.verifyPassword(
                currentPassword,
                user.password,
            );

            if (!isValidPassword) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect',
                });
            }

            // Cập nhật password mới
            await UserModel.update(userId, { password: newPassword });

            res.json({
                success: true,
                message: 'Password changed successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: 'Failed to change password',
            });
        }
    },

    // Lấy tất cả users (chỉ Admin)
    async getAllUsers(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                role,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            // Chỉ Admin mới được xem tất cả users
            if (req.user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin only.',
                });
            }

            const filter = {};
            if (role) filter.role = role;

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort,
            };

            const result = await UserModel.findAll(filter, options);

            // Ẩn password trong response
            result.data = result.data.map((user) => ({
                _id: user._id,
                username: user.username,
                fullName: user.fullName,
                role: user.role,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            }));

            res.json({
                success: true,
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Cập nhật user (chỉ Admin)
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            // Chỉ Admin mới được cập nhật user
            if (req.user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin only.',
                });
            }

            const result = await UserModel.update(id, updateData);

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            res.json({
                success: true,
                message: 'User updated successfully',
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Xóa user (chỉ Admin)
    async deleteUser(req, res) {
        try {
            const { id } = req.params;

            // Chỉ Admin mới được xóa user
            if (req.user.role !== 'Admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Admin only.',
                });
            }

            // Không cho xóa chính mình
            if (id === req.user._id.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete your own account',
                });
            }

            const result = await UserModel.delete(id);

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            res.json({
                success: true,
                message: 'User deleted successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },
};

module.exports = authController;
