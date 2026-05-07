'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DATABASE_NAME || 'vi_power';

const TEST_DEVICE = {
    deviceid: 'TEST001',
    deviceName: 'Thiết bị test tổng hợp',
    deviceType: 'máy sản xuất',
    location: 'Tầng 1 - Khu A',
    coordinates: { x: 120, y: 85 },
    samplingCycle: 60,
    alertDelayCycles: 1,
    status: 'active',
    displaygroupid: 'GROUP001',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const NUM_RECORDS = 100;  // số bản ghi giả lập
const INTERVAL_SEC = 60;  // khoảng cách giữa các mốc thời gian

function randFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function generateEnergyRecord(deviceId, timestamp) {
    const I1 = randFloat(5, 25);
    const I2 = randFloat(5, 25);
    const I3 = randFloat(5, 25);
    const U1N = randFloat(215, 235);
    const U2N = randFloat(215, 235);
    const U3N = randFloat(215, 235);
    const totalKW = parseFloat(((I1 * U1N + I2 * U2N + I3 * U3N) / 1000).toFixed(3));
    const kWh = randFloat(100, 500, 3);
    const PF = randFloat(0.85, 1.0, 3);

    return {
        deviceId,
        timestamp,
        currentI1: I1,
        currentI2: I2,
        currentI3: I3,
        voltageV1N: U1N,
        voltageV2N: U2N,
        voltageV3N: U3N,
        voltageV12: parseFloat((U1N - U2N + 380).toFixed(2)),
        voltageV23: parseFloat((U2N - U3N + 380).toFixed(2)),
        voltageV31: parseFloat((U3N - U1N + 380).toFixed(2)),
        power: kWh,
        netpower: totalKW,
        per: PF,
    };
}

async function run() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);
    console.log(`✅ Connected to ${DB_NAME}`);

    // ── 1. Tạo hoặc bỏ qua device ──────────────────────────────────────────
    const devices = db.collection('devices');
    const existing = await devices.findOne({ deviceid: TEST_DEVICE.deviceid });

    if (existing) {
        console.log(`ℹ️  Device "${TEST_DEVICE.deviceid}" already exists — skip insert`);
    } else {
        const result = await devices.insertOne(TEST_DEVICE);
        console.log(`✅ Device inserted: ${result.insertedId}`);
    }

    // ── 2. Đảm bảo collection energy_data tồn tại với index ───────────────
    const colName = `energy_data_${TEST_DEVICE.deviceid}`;
    const existingCols = await db.listCollections({ name: colName }).toArray();

    if (existingCols.length === 0) {
        await db.createCollection(colName);
        console.log(`✅ Created collection: ${colName}`);
    } else {
        console.log(`ℹ️  Collection "${colName}" already exists`);
    }

    const energyCol = db.collection(colName);
    await energyCol.createIndex({ timestamp: 1 });
    await energyCol.createIndex({ deviceId: 1 });
    await energyCol.createIndex({ deviceId: 1, timestamp: 1 });
    console.log(`✅ Indexes ensured`);

    // ── 3. Insert giả lập NUM_RECORDS bản ghi ──────────────────────────────
    const now = Date.now();
    const records = Array.from({ length: NUM_RECORDS }, (_, i) => {
        const ts = new Date(now - (NUM_RECORDS - i) * INTERVAL_SEC * 1000);
        return generateEnergyRecord(TEST_DEVICE.deviceid, ts);
    });

    const insertResult = await energyCol.insertMany(records);
    console.log(`✅ Inserted ${insertResult.insertedCount} energy records into "${colName}"`);

    // ── 4. Upsert latest_data ───────────────────────────────────────────────
    const latestRecord = records[records.length - 1];
    const latestCol = db.collection('latest_data');
    const channels = ['currentI1','currentI2','currentI3','voltageV1N','voltageV2N','voltageV3N','voltageV12','voltageV23','voltageV31','power','netpower','per'];

    const ops = channels.map((ch) => ({
        updateOne: {
            filter: { deviceId: TEST_DEVICE.deviceid, channel: ch },
            update: {
                $set: { timestamp: latestRecord.timestamp, value: latestRecord[ch] },
                $setOnInsert: { basemin: null, basemax: null },
            },
            upsert: true,
        },
    }));
    await latestCol.bulkWrite(ops);
    console.log(`✅ latest_data upserted for ${TEST_DEVICE.deviceid}`);

    // ── 5. Summary ──────────────────────────────────────────────────────────
    console.log('\n=== SUMMARY ===');
    console.log(`Device       : ${TEST_DEVICE.deviceid} — ${TEST_DEVICE.deviceName}`);
    console.log(`Type         : ${TEST_DEVICE.deviceType}`);
    console.log(`Group        : ${TEST_DEVICE.displaygroupid}`);
    console.log(`Location     : ${TEST_DEVICE.location}`);
    console.log(`Energy recs  : ${NUM_RECORDS} (từ ${records[0].timestamp.toISOString()} → ${latestRecord.timestamp.toISOString()})`);
    console.log(`Latest power : ${latestRecord.power} kWh | net: ${latestRecord.netpower} kW | PF: ${latestRecord.per}`);
    console.log('===============\n');

    await client.close();
}

run().catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
