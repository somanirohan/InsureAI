const mongoose = require('mongoose');

// Collection: policy_comparisons (FR-07)
const policyComparisonSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user_id is required'],
      index: true,
    },
    policy_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        required: true,
      },
    ],
    comparison_result: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'comparison_result is required'],
      default: () => ({
        policies_metadata: [],
        coverage_comparison: {},
        premium_comparison: {},
        room_rent_comparison: {},
        waiting_periods_comparison: {},
        copay_comparison: {},
        exclusions_diff: {},
      }),
    },
    created_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
);

const PolicyComparison = mongoose.model('PolicyComparison', policyComparisonSchema);
module.exports = PolicyComparison;
