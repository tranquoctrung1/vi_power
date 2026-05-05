const mqtt = require('mqtt');
const { MongoClient } = require('mongodb');

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
        const device = await this.db.collection('devices').findOne({ deviceid: deviceId });
        if (!device) {
            console.warn(`⚠️ MQTT data ignored: device "${deviceId}" not registered`);
            return;
        }

        const o = data.object || {};
        const obj = {
            deviceId: deviceId,
            timestamp: new Date(Date.now()),
            currentI1: o.I1 ?? null,
            currentI2: o.I2 ?? null,
            currentI3: o.I3 ?? null,
            voltageV1N: o.U1N ?? null,
            voltageV2N: o.U2N ?? null,
            voltageV3N: o.U3N ?? null,
            voltageV12: o.U12 ?? null,
            voltageV23: o.U23 ?? null,
            voltageV31: o.U31 ?? null,
            power: o.KWh ?? null,
            netpower: o.Total_KW ?? null,
            per: o.PF ?? null,
        };

        const collection = this.db.collection(`energy_data_${deviceId}`);
        const result = await collection.insertOne(obj);

        if (result.insertedId) {
            process.send({
                type: 'history_inserted',
                data: obj,
            });
            await this.upsertLatestData(deviceId, obj);
        }
    }

    async upsertLatestData(deviceId, obj) {
        if (!this.db) return;
        const latestCollection = this.db.collection('latest_data');
        const channelKeys = [
            'currentI1', 'currentI2', 'currentI3',
            'voltageV1N', 'voltageV2N', 'voltageV3N',
            'voltageV12', 'voltageV23', 'voltageV31',
            'power', 'netpower', 'per',
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
    if (worker.client) {
        worker.client.end();
    }
    if (worker.mongoClient) {
        worker.mongoClient.close();
    }
});
