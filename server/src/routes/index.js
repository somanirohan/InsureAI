const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const policyRoutes = require('./policyRoutes');
const chatRoutes = require('./chatRoutes');
const costRoutes = require('./costRoutes');
const comparisonRoutes = require('./comparisonRoutes');

router.use('/auth', authRoutes);
router.use('/policies', policyRoutes);
router.use('/chat', chatRoutes);
router.use('/cost', costRoutes);
router.use('/comparisons', comparisonRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    service: 'MedShield Insurance Policy Intelligence API',
    version: '1.0.0',
  });
});

module.exports = router;
