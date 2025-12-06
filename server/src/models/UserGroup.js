const { ObjectId } = require("mongodb");

class UserGroup {
  constructor(data) {
    this.displaygrouid = data.displaygrouid;
    this.username = data.username;
    this.createdAt = data.createdAt || new Date();
  }
}

const UserGroupModel = {
  // CREATE - Thêm user vào group
  async create(db, userGroupData) {
    try {
      const userGroups = db.collection("user_group");

      // Kiểm tra đã tồn tại chưa
      const existing = await userGroups.findOne({
        displaygrouid: userGroupData.displaygrouid,
        username: userGroupData.username,
      });

      if (existing) {
        throw new Error("User already in this group");
      }

      const userGroup = new UserGroup(userGroupData);
      const result = await userGroups.insertOne(userGroup);
      return { ...userGroup, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy user groups theo username
  async findByUsername(db, username) {
    try {
      const userGroups = db.collection("user_group");
      return await userGroups.find({ username }).toArray();
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy users theo group
  async findByGroupId(db, displaygrouid) {
    try {
      const userGroups = db.collection("user_group");
      return await userGroups.find({ displaygrouid }).toArray();
    } catch (error) {
      throw error;
    }
  },

  // READ - Lấy tất cả user groups
  async findAll(db, filter = {}) {
    try {
      const userGroups = db.collection("user_group");
      return await userGroups.find(filter).toArray();
    } catch (error) {
      throw error;
    }
  },

  // DELETE - Xóa user khỏi group
  async delete(db, userGroupId) {
    try {
      const userGroups = db.collection("user_group");
      const result = await userGroups.deleteOne({
        _id: new ObjectId(userGroupId),
      });
      return result;
    } catch (error) {
      throw error;
    }
  },

  // DELETE - Xóa user khỏi group theo username và groupid
  async deleteByUserAndGroup(db, username, displaygrouid) {
    try {
      const userGroups = db.collection("user_group");
      const result = await userGroups.deleteOne({ username, displaygrouid });
      return result;
    } catch (error) {
      throw error;
    }
  },

  // Kiểm tra user có trong group không
  async isUserInGroup(db, username, displaygrouid) {
    try {
      const userGroups = db.collection("user_group");
      const result = await userGroups.findOne({ username, displaygrouid });
      return result !== null;
    } catch (error) {
      throw error;
    }
  },
};

module.exports = UserGroupModel;
