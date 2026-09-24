const express = require('express');
const router = express.Router();
const costController = require('../controllers/costController');
const { protect } = require('../middleware/auth');

router.use(protect); // Data isolation (NFR 5.3)

router.get('/benchmarks', costController.getBenchmarks);
router.post('/estimate', costController.createEstimate);
router.post('/estimate/:id/what-if', costController.addWhatIfVariant);
router.get('/history', costController.getEstimateHistory);

module.exports = router;
