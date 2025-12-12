const { MongoClient } = require('mongodb');
require('dotenv').config();

class Database {
    constructor() {
        this.client = new MongoClient(process.env.MONGODB_URI);
        this.dbName = process.env.DATABASE_NAME;
        this.db = null;
    }

    async connect() {
        try {
            await this.client.connect();
            this.db = this.client.db(this.dbName);
            console.log('Connected to MongoDB successfully');
            return this.db;
        } catch (error) {
            console.error('MongoDB connection error:', error);
            process.exit(1);
        }
    }

    getDatabase() {
        return this.db;
    }

    async close() {
        await this.client.close();
        console.log('MongoDB connection closed');
    }
}

module.exports = new Database();
