import { Router } from 'express';
import { Conversation } from '../models/Conversation.js';
import { ConversationMessage } from '../models/ConversationMessage.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, isValidObjectId } from '../utils/helpers.js';

const router = Router();

/**
 * Load a conversation and verify the current user is one of the two participants.
 */
async function findAuthorizedConversation(conversationId, userId) {
  if (!isValidObjectId(conversationId)) {
    return { error: { status: 400, message: 'Invalid conversation ID' } };
  }

  const conversation = await Conversation.findById(conversationId)
    .populate('participants', 'name email')
    .populate('originalMessage', 'content createdAt');

  if (!conversation) {
    return { error: { status: 404, message: 'Conversation not found' } };
  }

  const isParticipant = conversation.participants.some((p) => p._id.equals(userId));
  if (!isParticipant) {
    return {
      error: {
        status: 403,
        message: 'Authorization denied: only the two users involved can access this conversation',
      },
    };
  }

  return { conversation };
}

/**
 * GET /api/conversations
 * List all conversations the authenticated user participates in.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name email')
      .populate('originalMessage', 'content createdAt')
      .sort({ updatedAt: -1 });

    res.json({ conversations });
  })
);

/**
 * 4) Send Messages (inside conversation)
 * POST /api/conversations/:id/messages
 * Only the two users involved in the conversation can send messages.
 */
router.post(
  '/:id/messages',
  authenticate,
  asyncHandler(async (req, res) => {
    const { conversation, error } = await findAuthorizedConversation(
      req.params.id,
      req.user._id
    );
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const newMessage = await ConversationMessage.create({
      conversation: conversation._id,
      sender: req.user._id,
      content: content.trim(),
    });

    await newMessage.populate('sender', 'name email');

    res.status(201).json({ message: newMessage });
  })
);

/**
 * 5) Get Conversation Messages
 * GET /api/conversations/:id/messages
 * Only the two users involved in the conversation can retrieve messages.
 */
router.get(
  '/:id/messages',
  authenticate,
  asyncHandler(async (req, res) => {
    const { conversation, error } = await findAuthorizedConversation(
      req.params.id,
      req.user._id
    );
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const messages = await ConversationMessage.find({ conversation: conversation._id })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 });

    res.json({ conversation, messages });
  })
);

export default router;
