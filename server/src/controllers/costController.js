const CostEstimate = require('../models/CostEstimate');
const costEstimatorService = require('../services/costEstimatorService');

/**
 * @route   POST /api/cost/estimate
 * @desc    Calculate and save treatment cost breakdown (FR-14)
 */
exports.createEstimate = async (req, res, next) => {
  try {
    const { policy_id, treatment_name, hospital_tier, room_rent_per_day, stay_days } = req.body;

    if (!policy_id || !treatment_name) {
      return res.status(400).json({
        success: false,
        error: 'Please provide both policy_id and treatment_name',
      });
    }

    const estimate = await costEstimatorService.createEstimate({
      userId: req.user._id,
      policyId: policy_id,
      treatmentName: treatment_name,
      hospitalTier: hospital_tier || 'tier_1',
      roomRentPerDay: room_rent_per_day ? Number(room_rent_per_day) : 8000,
      stayDays: stay_days ? Number(stay_days) : 4,
    });

    res.status(201).json({
      success: true,
      estimate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/cost/estimate/:id/what-if
 * @desc    Calculate what-if scenario and embed variant into estimate (FR-15, FR-17)
 */
exports.addWhatIfVariant = async (req, res, next) => {
  try {
    const { changed_variable, new_value } = req.body;

    if (!changed_variable || new_value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'changed_variable and new_value are required',
      });
    }

    const result = await costEstimatorService.addWhatIfVariant({
      userId: req.user._id,
      estimateId: req.params.id,
      changedVariable: changed_variable,
      newValue: new_value,
    });

    res.json({
      success: true,
      estimate: result.estimate,
      variant: result.variant,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/cost/history
 * @desc    Get user's past cost estimates ordered by created_at descending
 */
exports.getEstimateHistory = async (req, res, next) => {
  try {
    const estimates = await CostEstimate.find({ user_id: req.user._id })
      .populate('policy_id', 'insurer_name policy_type policy_number sum_insured')
      .sort({ created_at: -1 });

    res.json({
      success: true,
      estimates,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/cost/benchmarks
 * @desc    Get available treatment benchmarks and hospital tier descriptions
 */
exports.getBenchmarks = async (req, res) => {
  res.json({
    success: true,
    treatments: [
      { name: 'Knee Replacement', category: 'Orthopedic', commonStayDays: 5 },
      { name: 'Angioplasty', category: 'Cardiology', commonStayDays: 3 },
      { name: 'Cataract Surgery', category: 'Ophthalmology', commonStayDays: 1 },
      { name: 'Appendectomy', category: 'General Surgery', commonStayDays: 3 },
      { name: 'Chemotherapy (per cycle)', category: 'Oncology', commonStayDays: 1 },
      { name: 'Gallbladder Removal', category: 'General Surgery', commonStayDays: 2 },
      { name: 'Cardiac Bypass (CABG)', category: 'Cardiology', commonStayDays: 8 },
    ],
    tiers: [
      { id: 'tier_1', name: 'Tier 1 (Metro Super Specialty / JCI Accredited)', description: 'Fortis, Apollo, Max, Manipal in Metro cities' },
      { id: 'tier_2', name: 'Tier 2 (City Private Specialty Hospitals)', description: 'Regional multi-specialty nursing homes and hospitals' },
      { id: 'tier_3', name: 'Tier 3 (Semi-Urban / Community Care Centers)', description: 'District level healthcare facilities' },
    ],
  });
};
