const PolicyComparison = require('../models/PolicyComparison');
const comparisonService = require('../services/comparisonService');

/**
 * @route   POST /api/comparisons
 * @desc    Compare multiple policies and store diff snapshot (FR-07)
 */
exports.comparePolicies = async (req, res, next) => {
  try {
    const { policy_ids } = req.body;

    if (!policy_ids || !Array.isArray(policy_ids) || policy_ids.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of at least 2 policy_ids to compare',
      });
    }

    const comparison = await comparisonService.comparePolicies(
      req.user._id,
      policy_ids
    );

    res.status(201).json({
      success: true,
      comparison,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/comparisons/history
 * @desc    Get previous policy comparisons for user
 */
exports.getComparisonHistory = async (req, res, next) => {
  try {
    const comparisons = await PolicyComparison.find({ user_id: req.user._id })
      .populate('policy_ids', 'insurer_name policy_type policy_number sum_insured')
      .sort({ created_at: -1 });

    res.json({
      success: true,
      comparisons,
    });
  } catch (error) {
    next(error);
  }
};
