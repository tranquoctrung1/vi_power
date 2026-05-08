'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fcm = require('../services/fcm');

const testAlert = {
    deviceid:   'TEST001',
    deviceName: 'Tủ điện tầng 1',
    alertType:  'threshold_high',
    channel:    'currentI1',
    message:    'Dòng I1 vượt ngưỡng trên: 28.5 > 25',
    severity:   'red',
    timestamp:  new Date(),
};

console.log('📲 Sending test FCM notification...');
console.log('   Topic  : vipower_alerts');
console.log('   Device : ' + testAlert.deviceid);
console.log('   Type   : ' + testAlert.alertType);
console.log('   Message: ' + testAlert.message);
console.log('');

fcm.sendAlertNotification(testAlert).then(() => {
    setTimeout(() => process.exit(0), 500);
});
