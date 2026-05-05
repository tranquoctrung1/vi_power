const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const logger = require('../middleware/logger');

router.use(authenticate);
router.use(authorize('Admin'));

router.get('/',         logger.getApiLogs);
router.get('/summary',  logger.getUserActivitySummary);
router.delete('/cleanup', logger.clearOldLogs);

module.exports = router;
