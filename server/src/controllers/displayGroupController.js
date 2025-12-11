const DisplayGroupModel = require('../models/DisplayGroup');

const displayGroupController = {
    // Tạo display group mới
    async createDisplayGroup(req, res) {
        try {
            const groupData = req.body;

            const group = await DisplayGroupModel.create(groupData);

            res.status(201).json({
                success: true,
                message: 'Display group created successfully',
                data: group,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy display group theo ID
    async getDisplayGroupById(req, res) {
        try {
            const { id } = req.params;

            const group = await DisplayGroupModel.findById(id);

            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            res.json({
                success: true,
                data: group,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy display group theo displaygrouid
    async getDisplayGroupByGroupId(req, res) {
        try {
            const { displaygrouid } = req.params;

            const group = await DisplayGroupModel.findByGroupId(displaygrouid);

            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            res.json({
                success: true,
                data: group,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy tất cả display groups
    async getAllDisplayGroups(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                sortBy = 'createdAt',
                sortOrder = 'desc',
            } = req.query;

            const filter = {};

            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { note: { $regex: search, $options: 'i' } },
                    { displaygrouid: { $regex: search, $options: 'i' } },
                ];
            }

            const sort = {};
            sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const groups = await DisplayGroupModel.findAll(filter);

            // Manual pagination
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            const paginatedGroups = groups.slice(startIndex, endIndex);

            res.json({
                success: true,
                data: paginatedGroups,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: groups.length,
                    pages: Math.ceil(groups.length / limit),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Cập nhật display group
    async updateDisplayGroup(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;

            const result = await DisplayGroupModel.update(id, updateData);

            if (result.matchedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            res.json({
                success: true,
                message: 'Display group updated successfully',
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Xóa display group
    async deleteDisplayGroup(req, res) {
        try {
            const { id } = req.params;

            const result = await DisplayGroupModel.delete(id);

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            res.json({
                success: true,
                message: 'Display group deleted successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy thống kê display groups
    async getDisplayGroupStats(req, res) {
        try {
            const stats = await DisplayGroupModel.getStats(db);

            res.json({
                success: true,
                data: stats,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Tìm kiếm display groups
    async searchDisplayGroups(req, res) {
        try {
            const { query } = req.query;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required',
                });
            }

            const filter = {
                $or: [
                    { name: { $regex: query, $options: 'i' } },
                    { note: { $regex: query, $options: 'i' } },
                    { displaygrouid: { $regex: query, $options: 'i' } },
                ],
            };

            const groups = await DisplayGroupModel.findAll(filter);

            res.json({
                success: true,
                count: groups.length,
                data: groups,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },
};

module.exports = displayGroupController;
