const { v4: uuidv4 } = require('uuid');
const Conversation = require('../models/Conversation');
const ragService = require('../services/ragService');

/**
 * @route   POST /api/chat/message
 * @desc    Send question to RAG chatbot with citations and confidence verification (FR-08 - FR-13)
 */
exports.sendMessage = async (req, res, next) => {
  try {
    const { conversation_id, policy_id, question, plain_language_mode } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Question is required',
      });
    }

    let conversation = null;

    if (conversation_id) {
      conversation = await Conversation.findOne({
        _id: conversation_id,
        user_id: req.user._id,
      });
    }

    if (!conversation) {
      conversation = new Conversation({
        user_id: req.user._id,
        policy_id: policy_id || null,
        title: question.trim().slice(0, 45) + (question.length > 45 ? '...' : ''),
        messages: [],
      });
    }

    // Record user message
    const userMessage = {
      message_id: uuidv4(),
      role: 'user',
      content: question,
      query_type: null,
      plain_language: null,
      confidence_level: null,
      verification_passed: null,
      verification_notes: null,
      citations: [],
      created_at: new Date(),
    };

    conversation.messages.push(userMessage);

    // Call RAG Pipeline
    const ragResponse = await ragService.answerQuestion({
      userId: req.user._id,
      policyId: conversation.policy_id || policy_id,
      question: question,
      plainLanguageRequested: !!plain_language_mode,
    });

    // Record assistant message
    const assistantMessage = {
      message_id: uuidv4(),
      role: 'assistant',
      content: ragResponse.answer,
      query_type: ragResponse.queryType,
      plain_language: ragResponse.plainLanguage,
      confidence_level: ragResponse.confidenceLevel,
      verification_passed: ragResponse.verificationPassed,
      verification_notes: ragResponse.verificationNotes,
      citations: ragResponse.citations,
      created_at: new Date(),
    };

    conversation.messages.push(assistantMessage);
    conversation.updated_at = new Date();
    await conversation.save();

    res.json({
      success: true,
      conversationId: conversation._id,
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/chat/conversations
 * @desc    Get user's chat history ordered by updated_at descending
 */
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ user_id: req.user._id })
      .populate('policy_id', 'insurer_name policy_type policy_number')
      .sort({ updated_at: -1 })
      .limit(30);

    res.json({
      success: true,
      conversations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/chat/conversations/:id
 * @desc    Get specific conversation with all embedded messages
 */
exports.getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findOne({
      _id: req.params.id,
      user_id: req.user._id,
    }).populate('policy_id', 'insurer_name policy_type policy_number sum_insured');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found',
      });
    }

    res.json({
      success: true,
      conversation,
    });
  } catch (error) {
    next(error);
  }
};
