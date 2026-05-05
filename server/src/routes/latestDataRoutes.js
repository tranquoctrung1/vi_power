const express = require('express');
const router = express.Router();
const latestDataController = require('../controllers/latestDataController');
const { authenticate, denyViewer } = require('../middleware/auth');

router.use(authenticate);

// Get all channels + thresholds for a device
router.get('/:deviceid', latestDataController.getByDevice);

// Update threshold for a single channel
router.patch('/:deviceid/:channel/threshold', denyViewer, latestDataController.updateThreshold);

// Bulk update thresholds for a device (used from device add/edit page)
router.put('/:deviceid/thresholds', denyViewer, latestDataController.updateAllThresholds);

module.exports = router;
