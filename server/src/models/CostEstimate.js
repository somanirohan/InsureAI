const mongoose = require('mongoose');

// Embedded what_if_variants subdocument schema (FR-15, FR-17)
const whatIfVariantSchema = new mongoose.Schema(
  {
    variant_id: {
      type: String,
      required: [true, 'variant_id (UUID) is required'],
      trim: true,
    },
    changed_variable: {
      type: String,
      required: [true, 'changed_variable is required'],
      enum: ['hospital_tier', 'rider', 'sum_insured'],
    },
    original_value: {
      type: String,
      default: null,
    },
    new_value: {
      type: String,
      required: [true, 'new_value is required'],
    },
    recalculated_total_cost: {
      type: Number,
      required: [true, 'recalculated_total_cost is required'],
    },
    recalculated_covered_amount: {
      type: Number,
      required: [true, 'recalculated_covered_amount is required'],
    },
    recalculated_out_of_pocket: {
      type: Number,
      required: [true, 'recalculated_out_of_pocket is required'],
    },
    cost_breakdown: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'cost_breakdown object is required'],
    },
    created_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

// Main CostEstimate schema (FR-14, FR-15, FR-17)
const costEstimateSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user_id is required'],
      index: true,
    },
    policy_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      required: [true, 'policy_id is required'],
      index: true,
    },
    treatment_name: {
      type: String,
      required: [true, 'treatment_name is required'],
      trim: true,
    },
    hospital_tier: {
      type: String,
      required: [true, 'hospital_tier is required'],
      trim: true,
      default: 'tier_1',
    },
    estimated_total_cost: {
      type: Number,
      required: [true, 'estimated_total_cost is required'],
    },
    covered_amount: {
      type: Number,
      required: [true, 'covered_amount is required'],
    },
    out_of_pocket_amount: {
      type: Number,
      required: [true, 'out_of_pocket_amount is required'],
    },
    cost_breakdown: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'cost_breakdown is required'],
      default: () => ({
        base_hospital_charges: 0,
        room_rent_applied: 0,
        room_rent_copay_penalty: 0,
        deductible_deducted: 0,
        copay_percentage: 0,
        copay_amount: 0,
        sub_limit_caps_applied: [],
        excluded_items_cost: 0,
        final_payable_by_insurer: 0,
        final_payable_by_user: 0,
      }),
    },
    what_if_variants: {
      type: [whatIfVariantSchema],
      default: [],
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

// Index on created_at descending for estimate history
costEstimateSchema.index({ created_at: -1 });

const CostEstimate = mongoose.model('CostEstimate', costEstimateSchema);
module.exports = CostEstimate;
