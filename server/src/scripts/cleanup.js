'use strict';
const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://localhost:27017';
const DATABASE_NAME = 'vi_power';

async function cleanup() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(DATABASE_NAME);

        // 1. Xóa tất cả devices
        const devResult = await db.collection('devices').deleteMany({});
        console.log(`devices deleted: ${devResult.deletedCount}`);

        // 2. Xóa tất cả displaygroups
        const dgResult = await db.collection('displaygroups').deleteMany({});
        console.log(`displaygroups deleted: ${dgResult.deletedCount}`);

        // 3. Xóa users trừ bavitech
        const userResult = await db.collection('users').deleteMany({ username: { $ne: 'bavitech' } });
        console.log(`users deleted: ${userResult.deletedCount}`);

        // 4. Drop tất cả energy_data_* collections
        const allCols = await db.listCollections().toArray();
        const energyCols = allCols.filter(c => c.name.startsWith('energy_data_'));
        for (const col of energyCols) {
            await db.collection(col.name).drop();
            console.log(`dropped: ${col.name}`);
        }
        console.log(`energy_data_ collections dropped: ${energyCols.length}`);

        console.log('Done.');
    } finally {
        await client.close();
    }
}

cleanup().catch(console.error);
