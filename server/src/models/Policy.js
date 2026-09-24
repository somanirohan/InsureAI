const mongoose = require('mongoose');

// Embedded facts array subdocument schema (FR-05)
const policyFactSchema = new mongoose.Schema(
  {
    fact_id: {
      type: String,
      required: [true, 'fact_id (UUID) is required'],
      trim: true,
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      enum: [
        'coverage_category',
        'sum_insured',
        'sub_limit',
        'waiting_period',
        'exclusion',
        'room_rent_limit',
        'co_payment',
        'deductible',
        'claim_condition',
      ],
    },
    fact_key: {
      type: String,
      required: [true, 'fact_key is required'],
      trim: true,
    },
    fact_value: {
      type: String,
      required: [true, 'fact_value is required'],
    },
    fact_value_numeric: {
      type: Number,
      default: null,
    },
    unit: {
      type: String,
      trim: true,
      default: null,
    },
    source_page: {
      type: Number,
      default: null,
    },
    source_section: {
      type: String,
      trim: true,
      default: null,
    },
    extraction_confidence: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
  },
  { _id: false }
);

// Main Policy schema (FR-03, FR-05, FR-06)
const policySchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user_id is required'],
      index: true,
    },
    file_name: {
      type: String,
      required: [true, 'file_name is required'],
      trim: true,
    },
    file_path: {
      type: String,
      required: [true, 'file_path is required'],
    },
    file_size_bytes: {
      type: Number,
      default: 0,
    },
    insurer_name: {
      type: String,
      trim: true,
      default: null,
    },
    policy_type: {
      type: String,
      enum: [
        'individual_health',
        'family_floater',
        'group_health',
        'critical_illness',
        'other',
      ],
      default: 'individual_health',
    },
    policy_number: {
      type: String,
      trim: true,
      default: null,
    },
    sum_insured: {
      type: Number,
      default: null,
    },
    premium_amount: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      required: [true, 'status is required'],
      enum: ['uploading', 'extracting', 'indexed', 'ready', 'failed'],
      default: 'uploading',
      index: true,
    },
    ocr_used: {
      type: Boolean,
      required: true,
      default: false,
    },
    red_flag_summary: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({
        waiting_periods: [],
        major_exclusions: [],
        room_rent_cap: null,
        copay_percentage: null,
        notes: [],
      }),
    },
    facts: {
      type: [policyFactSchema],
      default: [],
    },
    uploaded_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    indexed_at: {
      type: Date,
      default: null,
    },
    updated_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'uploaded_at', updatedAt: 'updated_at' },
  }
);

// Multikey index on embedded facts category
policySchema.index({ 'facts.category': 1 });

const Policy = mongoose.model('Policy', policySchema);
module.exports = Policy;
