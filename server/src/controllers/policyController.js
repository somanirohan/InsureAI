const Policy = require('../models/Policy');
const policyService = require('../services/policyService');

/**
 * @route   POST /api/policies/upload
 * @desc    Upload policy PDF and start async processing pipeline (FR-03)
 */
exports.uploadPolicy = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an insurance policy PDF file',
      });
    }

    const { insurer_name, policy_type } = req.body;

    const policy = new Policy({
      user_id: req.user._id,
      file_name: req.file.originalname,
      file_path: req.file.path,
      file_size_bytes: req.file.size,
      insurer_name: insurer_name || null,
      policy_type: policy_type || 'individual_health',
      status: 'uploading',
      uploaded_at: new Date(),
    });

    await policy.save();

    // Trigger async non-blocking document processing in background
    setImmediate(() => {
      policyService.processPolicyDocument(policy._id, req.user._id);
    });

    res.status(202).json({
      success: true,
      message: 'Policy document uploaded successfully. Processing pipeline started.',
      policy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/policies
 * @desc    Get all policies owned by current user (Data Isolation NFR 5.3)
 */
exports.getUserPolicies = async (req, res, next) => {
  try {
    const policies = await Policy.find({ user_id: req.user._id }).sort({
      uploaded_at: -1,
    });

    res.json({
      success: true,
      count: policies.length,
      policies,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/policies/:id
 * @desc    Get single policy by ID with embedded facts & red flags
 */
exports.getPolicyById = async (req, res, next) => {
  try {
    const policy = await Policy.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'Policy document not found or access denied',
      });
    }

    res.json({
      success: true,
      policy,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/policies/:id
 * @desc    Cascade delete policy, associated chunks, vectors, and clean references (Section 8)
 */
exports.deletePolicy = async (req, res, next) => {
  try {
    const result = await policyService.deletePolicyCascade(
      req.user._id,
      req.params.id
    );

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
