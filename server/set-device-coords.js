// One-time: set device coordinates so they show up on TanHiep map
// Sửa danh sách COORDS theo deviceId thật trên server trước khi chạy.
require('dotenv').config();
const { MongoClient } = require('mongodb');

// deviceId: [lat, lng] — lấy deviceId thật bằng cách chạy script này lần đầu để in ra list
const COORDS = {
    // 'a84041d95b5ed949': [10.908637, 106.587823],
};

(async () => {
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db(process.env.DATABASE_NAME);
    const devices = db.collection('devices');

    const all = await devices.find({}).toArray();
    console.log(`Found ${all.length} devices:`);
    for (const d of all) {
        console.log(`  ${d.deviceid}  "${d.deviceName}"  coords=${JSON.stringify(d.coordinates)}`);
    }

    if (Object.keys(COORDS).length === 0) {
        console.log('\nĐiền deviceId vào COORDS object trong file này rồi chạy lại để set tọa độ.');
        await client.close();
        return;
    }

    for (const [deviceid, [lat, lng]] of Object.entries(COORDS)) {
        const r = await devices.updateOne(
            { deviceid },
            { $set: { coordinates: { x: lng, y: lat } } },
        );
        console.log(`${deviceid}: matched=${r.matchedCount} modified=${r.modifiedCount}`);
    }

    await client.close();
})();
