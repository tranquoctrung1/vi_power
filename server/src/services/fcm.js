'use strict';

const admin = require('firebase-admin');
const path  = require('path');

const KEY_PATH = 'D:\\firebasekey\\fbkey-vipower-tanhiep.json';

let _app = null;

function _init() {
    if (_app) return;
    try {
        const serviceAccount = require(KEY_PATH);
        _app = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('✅ Firebase Admin initialized');
    } catch (err) {
        console.error('❌ Firebase Admin init failed:', err.message);
    }
}

_init();

const SEVERITY_LABEL = {
    red:    '🔴 Nghiêm trọng',
    orange: '🟠 Cảnh báo',
    green:  '✅ Đã khôi phục',
};

/**
 * Send FCM push notification for a new alert.
 * Sends to topic "vipower_alerts" (all subscribers).
 * Fire-and-forget — never throws.
 */
async function sendAlertNotification(alert) {
    if (!_app) return;
    try {
        const label      = SEVERITY_LABEL[alert.severity] || '⚠️ Cảnh báo';
        const deviceLabel = alert.deviceName || alert.deviceid;
        const title = `ViPower — ${label}`;
        const body  = `[${deviceLabel}] ${alert.message || `Cảnh báo từ thiết bị ${alert.deviceid}`}`;

        const msg = {
            notification: { title, body },
            data: {
                deviceid:  String(alert.deviceid  || ''),
                alertType: String(alert.alertType  || ''),
                severity:  String(alert.severity   || ''),
                channel:   String(alert.channel    || ''),
                timestamp: new Date(alert.timestamp || Date.now()).toISOString(),
            },
            android: {
                priority: alert.severity === 'red' ? 'high' : 'normal',
                notification: { sound: 'default', channelId: 'vipower_alerts' },
            },
            apns: {
                payload: { aps: { sound: 'default', badge: 1 } },
            },
            topic: 'vipower_alerts',
        };

        const response = await admin.messaging().send(msg);
        console.log(`📲 FCM sent [${alert.alertType}/${alert.severity}]: ${response}`);
    } catch (err) {
        console.error('❌ FCM send error:', err.message);
    }
}

module.exports = { sendAlertNotification };
