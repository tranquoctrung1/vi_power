const { ObjectId } = require("mongodb");

class DisplayGroup {
  constructor(data) {
    this.displaygrouid = data.displaygrouid;
    this.name = data.name;
    this.note = data.note || "";
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }
}

const DisplayGroupModel = {
  // CREATE
  async create(db, groupData) {
    try {
      const groups = db.collection("displaygroup");

      const existingGroup = await groups.findOne({
        displaygrouid: groupData.displaygrouid,
      });
      if (existingGroup) {
        throw new Error("Group ID already exists");
      }

      const group = new DisplayGroup(groupData);
      const result = await groups.insertOne(group);
      return { ...group, _id: result.insertedId };
    } catch (error) {
      throw error;
    }
  },

  // READ by ID
  async findById(db, groupId) {
    try {
      const groups = db.collection("displaygroup");
      return await groups.findOne({ _id: new ObjectId(groupId) });
    } catch (error) {
      throw error;
    }
  },

  // READ by displaygrouid
  async findByGroupId(db, displaygrouid) {
    try {
      const groups = db.collection("displaygroup");
      return await groups.findOne({ displaygrouid });
    } catch (error) {
      throw error;
    }
  },

  // READ all
  async findAll(db, filter = {}) {
    try {
      const groups = db.collection("displaygroup");
      return await groups.find(filter).toArray();
    } catch (error) {
      throw error;
    }
  },

  // UPDATE
  async update(db, groupId, updateData) {
    try {
      const groups = db.collection("displaygroup");

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
  async delete(db, groupId) {
    try {
      const groups = db.collection("displaygroup");
      const result = await groups.deleteOne({ _id: new ObjectId(groupId) });
      return result;
    } catch (error) {
      throw error;
    }
  },
};

module.exports = DisplayGroupModel;
