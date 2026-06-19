const express = require('express');
const router = express.Router();
const internalController = require('../controllers/internalController');

router.post('/sync-user', internalController.syncUser);

module.exports = router;
