const mongoose = require('mongoose');

// Collection: policy_chunks (FR-04, FR-09)
const policyChunkSchema = new mongoose.Schema(
  {
    policy_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      required: [true, 'policy_id is required'],
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'user_id is required'],
      index: true,
    },
    chunk_index: {
      type: Number,
      required: [true, 'chunk_index is required'],
    },
    chunk_text: {
      type: String,
      required: [true, 'chunk_text is required'],
    },
    page_number: {
      type: Number,
      default: null,
    },
    section_heading: {
      type: String,
      trim: true,
      default: null,
    },
    token_count: {
      type: Number,
      default: null,
    },
    vector_id: {
      type: String,
      required: [true, 'vector_id (UUID join key for ChromaDB) is required'],
      index: true,
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

// Compound unique index on (policy_id, chunk_index)
policyChunkSchema.index({ policy_id: 1, chunk_index: 1 }, { unique: true });

const PolicyChunk = mongoose.model('PolicyChunk', policyChunkSchema);
module.exports = PolicyChunk;
