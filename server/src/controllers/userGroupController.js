const UserGroupModel = require('../models/UserGroup');
const UserModel = require('../models/User');
const DisplayGroupModel = require('../models/DisplayGroup');

const userGroupController = {
    // Thêm user vào group
    async addUserToGroup(req, res) {
        try {
            const userGroupData = req.body;

            // Kiểm tra user tồn tại
            const user = await UserModel.findByUsername(userGroupData.username);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            // Kiểm tra group tồn tại
            const group = await DisplayGroupModel.findByGroupId(
                userGroupData.displaygrouid,
            );
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            const userGroup = await UserGroupModel.create(db, userGroupData);

            res.status(201).json({
                success: true,
                message: 'User added to group successfully',
                data: userGroup,
            });
        } catch (error) {
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy danh sách users trong group
    async getUsersInGroup(req, res) {
        try {
            const { displaygrouid } = req.params;

            // Kiểm tra group tồn tại
            const group = await DisplayGroupModel.findByGroupId(displaygrouid);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            const users =
                await UserGroupModel.findUsersInGroupWithDetails(displaygrouid);

            res.json({
                success: true,
                group,
                count: users.length,
                data: users,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy danh sách groups của user
    async getUserGroups(req, res) {
        try {
            const { username } = req.params;

            // Kiểm tra user tồn tại
            const user = await UserModel.findByUsername(db, username);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found',
                });
            }

            const userGroups = await UserGroupModel.findByUsername(username);

            // Lấy thông tin chi tiết của từng group
            const groupsWithDetails = [];
            for (const ug of userGroups) {
                const group = await DisplayGroupModel.findByGroupId(
                    ug.displaygrouid,
                );
                if (group) {
                    groupsWithDetails.push({
                        ...group,
                        joinedAt: ug.createdAt,
                    });
                }
            }

            res.json({
                success: true,
                user: {
                    username: user.username,
                    fullName: user.fullName,
                    role: user.role,
                },
                count: groupsWithDetails.length,
                data: groupsWithDetails,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy tất cả user groups
    async getAllUserGroups(req, res) {
        try {
            const { page = 1, limit = 10, displaygrouid, username } = req.query;

            const filter = {};
            if (displaygrouid) filter.displaygrouid = displaygrouid;
            if (username) filter.username = username;

            const userGroups = await UserGroupModel.findAll(db, filter);

            // Lấy thông tin chi tiết
            const detailedData = [];
            for (const ug of userGroups) {
                const user = await UserModel.findByUsername(db, ug.username);
                const group = await DisplayGroupModel.findByGroupId(
                    ug.displaygrouid,
                );

                if (user && group) {
                    detailedData.push({
                        _id: ug._id,
                        username: ug.username,
                        displaygrouid: ug.displaygrouid,
                        joinedAt: ug.createdAt,
                        user: {
                            username: user.username,
                            fullName: user.fullName,
                            role: user.role,
                        },
                        group: {
                            displaygrouid: group.displaygrouid,
                            name: group.name,
                            note: group.note,
                        },
                    });
                }
            }

            // Manual pagination
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            const paginatedData = detailedData.slice(startIndex, endIndex);

            res.json({
                success: true,
                data: paginatedData,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: detailedData.length,
                    pages: Math.ceil(detailedData.length / limit),
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Xóa user khỏi group
    async removeUserFromGroup(req, res) {
        try {
            const { id } = req.params;

            const result = await UserGroupModel.delete(db, id);

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User group not found',
                });
            }

            res.json({
                success: true,
                message: 'User removed from group successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Xóa user khỏi group theo username và groupid
    async removeUserFromGroupByDetails(req, res) {
        try {
            const { username, displaygrouid } = req.params;

            const result = await UserGroupModel.deleteByUserAndGroup(
                username,
                displaygrouid,
            );

            if (result.deletedCount === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'User group not found',
                });
            }

            res.json({
                success: true,
                message: 'User removed from group successfully',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Kiểm tra user có trong group không
    async checkUserInGroup(req, res) {
        try {
            const { username, displaygrouid } = req.params;

            const isInGroup = await UserGroupModel.isUserInGroup(
                username,
                displaygrouid,
            );

            res.json({
                success: true,
                isInGroup,
                message: isInGroup
                    ? 'User is in group'
                    : 'User is not in group',
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Lấy thống kê user groups
    async getUserGroupStats(req, res) {
        try {
            const userGroups = db.collection('user_group');
            const displayGroups = db.collection('displaygroup');

            const totalUserGroups = await userGroups.countDocuments();
            const totalDisplayGroups = await displayGroups.countDocuments();

            // Nhóm theo displaygrouid
            const groupStats = await userGroups
                .aggregate([
                    {
                        $group: {
                            _id: '$displaygrouid',
                            userCount: { $sum: 1 },
                        },
                    },
                    {
                        $sort: { userCount: -1 },
                    },
                ])
                .toArray();

            // Nhóm theo username
            const userStats = await userGroups
                .aggregate([
                    {
                        $group: {
                            _id: '$username',
                            groupCount: { $sum: 1 },
                        },
                    },
                    {
                        $sort: { groupCount: -1 },
                    },
                ])
                .toArray();

            res.json({
                success: true,
                stats: {
                    totalUserGroups,
                    totalDisplayGroups,
                    averageUsersPerGroup:
                        totalDisplayGroups > 0
                            ? totalUserGroups / totalDisplayGroups
                            : 0,
                    groupStats,
                    userStats,
                },
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },

    // Thêm nhiều users vào group cùng lúc
    async addMultipleUsersToGroup(req, res) {
        try {
            const { displaygrouid, usernames } = req.body;

            if (!displaygrouid || !Array.isArray(usernames)) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Display group ID and usernames array are required',
                });
            }

            // Kiểm tra group tồn tại
            const group = await DisplayGroupModel.findByGroupId(displaygrouid);
            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: 'Display group not found',
                });
            }

            const results = {
                added: [],
                failed: [],
                alreadyInGroup: [],
            };

            for (const username of usernames) {
                try {
                    // Kiểm tra user tồn tại
                    const user = await UserModel.findByUsername(db, username);
                    if (!user) {
                        results.failed.push({
                            username,
                            error: 'User not found',
                        });
                        continue;
                    }

                    // Kiểm tra đã trong group chưa
                    const isInGroup = await UserGroupModel.isUserInGroup(
                        username,
                        displaygrouid,
                    );
                    if (isInGroup) {
                        results.alreadyInGroup.push(username);
                        continue;
                    }

                    // Thêm vào group
                    await UserGroupModel.create(db, {
                        displaygrouid,
                        username,
                    });
                    results.added.push(username);
                } catch (error) {
                    results.failed.push({ username, error: error.message });
                }
            }

            res.status(201).json({
                success: true,
                message: 'Users added to group',
                results,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    },
};

module.exports = userGroupController;
