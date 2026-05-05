const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ctrl = require('../controllers/apiKeyController');

// All routes: must be admin
router.get('/',          auth.authenticate, auth.authorize('Admin'), ctrl.getAll);
router.post('/',         auth.authenticate, auth.authorize('Admin'), ctrl.create);
router.patch('/:id/revoke',   auth.authenticate, auth.authorize('Admin'), ctrl.revoke);
router.patch('/:id/activate', auth.authenticate, auth.authorize('Admin'), ctrl.activate);
router.delete('/:id',    auth.authenticate, auth.authorize('Admin'), ctrl.delete);

module.exports = router;
