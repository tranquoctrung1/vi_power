const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');
const fcm = require('../services/fcm');

class MQTTWorker {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.options = {
            host: process.env.MQTT_HOST || 'mqtt://vilog.viwater.vn',
            port: process.env.MQTT_PORT || 1883,
            username: process.env.MQTT_USERNAME || '',
            password: process.env.MQTT_PASSWORD || '',
            clientId: 'mqtt_worker_' + Math.random().toString(16).substr(2, 8),
        };

        this.mongoClient = null;
        this.db = null;

        // Initialize database connection
        this.initDatabase();

        // Handle parent messages
        process.on('message', this.handleParentMessage.bind(this));
    }

    async initDatabase() {
        try {
            this.mongoClient = new MongoClient(
                process.env.MONGODB_URI || 'mongodb://localhost:27017',
            );
            await this.mongoClient.connect();
            this.db = this.mongoClient.db(process.env.DATABASE_NAME);
            console.log('✅ MQTT Worker connected to database');
            this.startOfflineMonitor();
        } catch (err) {
            console.error('❌ MQTT Worker database connection failed:', err);
        }
    }

    connect() {
        console.log('🔌 MQTT Worker trying to connect...');

        try {
            this.client = mqtt.connect(this.options.host, {
                port: this.options.port,
                username: this.options.username,
                password: this.options.password,
                clientId: this.options.clientId,
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 0,
            });
        } catch (err) {
            console.error('❌ MQTT Worker connect error:', err);
            this.retryConnect();
            return;
        }

        this.client.on('connect', () => {
            console.log('✅ MQTT Worker Connected!');
            this.isConnected = true;
            process.send({ type: 'mqtt_connected' });
        });

        this.client.on('message', async (topic, message) => {
            await this.handleMessage(topic, message);
        });

        this.client.on('error', (err) => {
            console.error('❌ MQTT Worker Error:', err.message);
            process.send({ type: 'mqtt_error', error: err.message });
            this.retryConnect();
        });

        this.client.on('close', () => {
            console.log('🔌 MQTT Worker Connection closed');
            this.isConnected = false;
            process.send({ type: 'mqtt_disconnected' });
            this.retryConnect();
        });

        this.client.on('offline', () => {
            console.log('📴 MQTT Worker offline');
            this.isConnected = false;
            process.send({ type: 'mqtt_offline' });
        });
    }

    async handleMessage(topic, message) {
        try {
            const payload = message.toString();
            let data;

            try {
                data = JSON.parse(payload);
            } catch {
                data = payload;
            }

            if (data && data.deviceInfo && data.deviceInfo.devEui) {
                await this.insertDataEnergy(data, data.deviceInfo.devEui);
            }

            // process.send({
            //   type: "alarm_created",
            //   data: alarmObj,
            // });
        } catch (error) {
            console.error('Error processing MQTT message:', error);
        }
    }

    async insertDataEnergy(data, deviceId) {
        const device = await this.db
            .collection('devices')
            .findOne({ deviceid: deviceId });
        if (!device) {
            console.warn(
                `⚠️ MQTT data ignored: device "${deviceId}" not registered`,
            );
            return;
        }

        const o = data.object || {};
        const r2 = v => v != null ? Math.round(v * 100) / 100 : null;
        const obj = {
            deviceId: deviceId,
            timestamp: new Date(Date.now()),
            currentI1: r2(o.I1),
            currentI2: r2(o.I2),
            currentI3: r2(o.I3),
            voltageV1N: r2(o.U1N),
            voltageV2N: r2(o.U2N),
            voltageV3N: r2(o.U3N),
            power: r2(o.KWh),
            netpower: r2(o.Total_KW),
            per: r2(o.PF),
        };

        const channelValues = [obj.currentI1, obj.currentI2, obj.currentI3, obj.voltageV1N, obj.voltageV2N, obj.voltageV3N, obj.power, obj.netpower, obj.per];
        if (channelValues.every(v => v == null)) {
            console.warn(`⚠️ MQTT data skipped: all channels null for ${deviceId}`);
            return;
        }

        const collection = this.db.collection(`energy_data_${deviceId}`);
        const result = await collection.insertOne(obj);

        if (result.insertedId) {
            process.send({
                type: 'history_inserted',
                data: obj,
            });
            await this.upsertLatestData(deviceId, obj);
            await this.resolveOfflineAlert(deviceId);
            await this.checkAlerts(deviceId, device);
        }
    }

    async checkAlerts(deviceId, device) {
        if (!this.db) return;
        const alertsCol  = this.db.collection('alerts');
        const latestCol  = this.db.collection('latest_data');
        const CHANNEL_NAMES = {
            currentI1:  'Dòng I1',
            currentI2:  'Dòng I2',
            currentI3:  'Dòng I3',
            voltageV1N: 'Điện áp V1N',
            voltageV2N: 'Điện áp V2N',
            voltageV3N: 'Điện áp V3N',
            power:      'Công suất (kWh)',
            netpower:   'Tổng công suất (kW)',
            per:        'Hệ số PF',
        };
        const now = new Date();

        const channels = await latestCol.find({ deviceId }).toArray();

        // ── Check vượt ngưỡng ──────────────────────────────
        for (const ch of channels) {
            if (ch.value == null) continue;
            const { channel, value, basemin, basemax } = ch;

            // Vượt ngưỡng trên
            if (basemax != null) {
                if (value > basemax) {
                    const ex = await alertsCol.findOne({ deviceid: deviceId, channel, alertType: 'threshold_high', isComplete: false });
                    if (ex) {
                        await alertsCol.updateOne({ _id: ex._id }, { $set: { timestamp: now, value } });
                    } else {
                        const highDoc = {
                            deviceid:   deviceId,
                            deviceName: device.deviceName || deviceId,
                            alertType:  'threshold_high',
                            channel,
                            message:    `${CHANNEL_NAMES[channel] || channel} vượt ngưỡng trên: ${value} > ${basemax}`,
                            severity:   'red',
                            isComplete: false,
                            resolved:   false,
                            timestamp:  now,
                            createdAt:  now,
                            value,
                            basemax,
                        };
                        await alertsCol.insertOne(highDoc);
                        fcm.sendAlertNotification(highDoc);
                        if (process.send) process.send({ type: 'new_alert', data: highDoc });
                    }
                } else {
                    const ex = await alertsCol.findOne({ deviceid: deviceId, channel, alertType: 'threshold_high', isComplete: false });
                    if (ex) await alertsCol.updateOne({ _id: ex._id }, { $set: { isComplete: true, severity: 'green', resolvedAt: now } });
                }
            }

            // Vượt ngưỡng dưới
            if (basemin != null) {
                if (value < basemin) {
                    const ex = await alertsCol.findOne({ deviceid: deviceId, channel, alertType: 'threshold_low', isComplete: false });
                    if (ex) {
                        await alertsCol.updateOne({ _id: ex._id }, { $set: { timestamp: now, value } });
                    } else {
                        const lowDoc = {
                            deviceid:   deviceId,
                            deviceName: device.deviceName || deviceId,
                            alertType:  'threshold_low',
                            channel,
                            message:    `${CHANNEL_NAMES[channel] || channel} vượt ngưỡng dưới: ${value} < ${basemin}`,
                            severity:   'red',
                            isComplete: false,
                            resolved:   false,
                            timestamp:  now,
                            createdAt:  now,
                            value,
                            basemin,
                        };
                        await alertsCol.insertOne(lowDoc);
                        fcm.sendAlertNotification(lowDoc);
                        if (process.send) process.send({ type: 'new_alert', data: lowDoc });
                    }
                } else {
                    const ex = await alertsCol.findOne({ deviceid: deviceId, channel, alertType: 'threshold_low', isComplete: false });
                    if (ex) await alertsCol.updateOne({ _id: ex._id }, { $set: { isComplete: true, severity: 'green', resolvedAt: now } });
                }
            }
        }
    }

    async upsertLatestData(deviceId, obj) {
        if (!this.db) return;
        const latestCollection = this.db.collection('latest_data');
        const channelKeys = [
            'currentI1',
            'currentI2',
            'currentI3',
            'voltageV1N',
            'voltageV2N',
            'voltageV3N',
            'power',
            'netpower',
            'per',
        ];
        const ops = channelKeys.map((channel) => ({
            updateOne: {
                filter: { deviceId, channel },
                update: {
                    $set: { timestamp: obj.timestamp, value: obj[channel] },
                    $setOnInsert: { basemin: null, basemax: null },
                },
                upsert: true,
            },
        }));
        await latestCollection.bulkWrite(ops);
    }

    async resolveOfflineAlert(deviceId) {
        if (!this.db) return;
        const now = new Date();
        const alertsCol = this.db.collection('alerts');
        const offlineAlert = await alertsCol.findOne({ deviceid: deviceId, alertType: 'offline', isComplete: false });
        if (!offlineAlert) return;
        await alertsCol.updateOne(
            { _id: offlineAlert._id },
            { $set: { isComplete: true, severity: 'green', resolvedAt: now } },
        );
        await this.db.collection('devices').updateOne(
            { deviceid: deviceId },
            { $set: { status: 'active', updatedAt: now } },
        );
    }

    startOfflineMonitor() {
        this._offlineTimer = setInterval(() => this.checkOfflineDevices(), 60000);
    }

    async checkOfflineDevices() {
        if (!this.db) return;
        const now = new Date();
        const devices = await this.db.collection('devices').find({ status: { $ne: 'inactive' } }).toArray();

        for (const device of devices) {
            const deviceId = device.deviceid;
            const samplingCycle = device.samplingCycle || 60;
            const alertDelayCycles = device.alertDelayCycles ?? 1;
            const thresholdMs = samplingCycle * alertDelayCycles * 1000;

            const recentCount = await this.db.collection('latest_data').countDocuments({
                deviceId,
                timestamp: { $gt: new Date(now - thresholdMs) },
            });

            if (recentCount === 0) {
                const alertsCol = this.db.collection('alerts');
                const existing = await alertsCol.findOne({ deviceid: deviceId, alertType: 'offline', isComplete: false });
                if (existing) {
                    await alertsCol.updateOne(
                        { _id: existing._id },
                        { $set: { timestamp: now, message: `Thiết bị ${deviceId} dừng hoạt động` } },
                    );
                } else {
                    const offlineDoc = {
                        deviceid:   deviceId,
                        deviceName: device.deviceName || deviceId,
                        alertType:  'offline',
                        channel:    null,
                        message:    `Thiết bị ${deviceId} dừng hoạt động`,
                        severity:   'orange',
                        isComplete: false,
                        resolved:   false,
                        timestamp:  now,
                        createdAt:  now,
                    };
                    await alertsCol.insertOne(offlineDoc);
                    fcm.sendAlertNotification(offlineDoc);
                    if (process.send) process.send({ type: 'new_alert', data: offlineDoc });
                    await this.db.collection('devices').updateOne(
                        { deviceid: deviceId },
                        { $set: { status: 'paused', updatedAt: now } },
                    );
                }
            }
        }
    }

    retryConnect() {
        console.log('⏳ MQTT Worker retrying in 5 seconds...');
        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    handleParentMessage(message) {
        if (!this.client || !this.isConnected) return;

        switch (message.type) {
            case 'subscribe':
                this.client.subscribe(
                    message.topic,
                    message.options || { qos: 0 },
                    (err) => {
                        if (err) {
                            console.error(
                                `❌ Failed to subscribe to ${message.topic}:`,
                                err,
                            );
                        } else {
                            console.log(
                                `✅ Subscribed to topic: ${message.topic}`,
                            );
                        }
                    },
                );
                break;

            case 'publish':
                const payload =
                    typeof message.message === 'object'
                        ? JSON.stringify(message.message)
                        : message.message;

                this.client.publish(
                    message.topic,
                    payload,
                    message.options || { qos: 0, retain: false },
                    (err) => {
                        if (err) {
                            console.error(
                                `❌ Failed to publish to ${message.topic}:`,
                                err,
                            );
                        } else {
                            console.log(
                                `✅ Published to ${message.topic}:`,
                                message.message,
                            );
                        }
                    },
                );
                break;

            case 'unsubscribe':
                this.client.unsubscribe(message.topic, (err) => {
                    if (err) {
                        console.error(
                            `❌ Failed to unsubscribe from ${message.topic}:`,
                            err,
                        );
                    } else {
                        console.log(
                            `✅ Unsubscribed from topic: ${message.topic}`,
                        );
                    }
                });
                break;

            case 'disconnect':
                if (this.client) {
                    this.client.end();
                }
                if (this.mongoClient) {
                    this.mongoClient.close();
                }

                process.exit(0);
                break;
        }
    }
}

// Start the worker
const worker = new MQTTWorker();
worker.connect();

// Handle cleanup
process.on('disconnect', () => {
    if (worker._offlineTimer) clearInterval(worker._offlineTimer);
    if (worker.client) {
        worker.client.end();
    }
    if (worker.mongoClient) {
        worker.mongoClient.close();
    }
});
