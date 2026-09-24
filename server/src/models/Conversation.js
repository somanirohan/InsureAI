const mongoose = require('mongoose');

// Embedded message citation schema (FR-10)
const citationSchema = new mongoose.Schema(
  {
    policy_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policy',
      default: null,
    },
    chunk_vector_id: {
      type: String,
      trim: true,
      default: null,
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
  },
  { _id: false }
);

// Embedded messages array subdocument schema (FR-08, FR-11, FR-12, FR-13, FR-16)
const messageSchema = new mongoose.Schema(
  {
    message_id: {
      type: String,
      required: [true, 'message_id (UUID) is required'],
      trim: true,
    },
    role: {
      type: String,
      required: [true, 'role is required'],
      enum: ['user', 'assistant'],
    },
    content: {
      type: String,
      required: [true, 'content is required'],
    },
    query_type: {
      type: String,
      enum: ['structured', 'semantic', null],
      default: null,
    },
    plain_language: {
      type: String,
      default: null,
    },
    confidence_level: {
      type: String,
      enum: ['high', 'medium', 'low', null],
      default: null,
    },
    verification_passed: {
      type: Boolean,
      default: null,
    },
    verification_notes: {
      type: String,
      default: null,
    },
    citations: {
      type: [citationSchema],
      default: [],
    },
    created_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false }
);

// Main Conversation schema (FR-08, FR-16)
const conversationSchema = new mongoose.Schema(
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
      default: null,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: 'New Conversation',
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
    created_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Descending index on updated_at for fast "recent activity / conversations" query
conversationSchema.index({ updated_at: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
module.exports = Conversation;
