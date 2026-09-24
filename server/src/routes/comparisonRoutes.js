const express = require('express');
const router = express.Router();
const comparisonController = require('../controllers/comparisonController');
const { protect } = require('../middleware/auth');

router.use(protect); // Data isolation (NFR 5.3)

router.post('/', comparisonController.comparePolicies);
router.get('/history', comparisonController.getComparisonHistory);

module.exports = router;
