const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect); // All policy endpoints require authentication and user_id scoping

router.post('/upload', upload.single('file'), policyController.uploadPolicy);
router.get('/', policyController.getUserPolicies);
router.get('/:id', policyController.getPolicyById);
router.delete('/:id', policyController.deletePolicy);

module.exports = router;
