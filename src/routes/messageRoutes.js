import { Router } from 'express';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, isValidObjectId } from '../utils/helpers.js';

const router = Router();

/**
 * Format a received message for the receiver.
 * Sender identity is stripped unless isIdentityRevealed is true.
 */
function formatReceivedMessage(msg) {
  return {
    _id: msg._id,
    content: msg.content,
    isIdentityRevealed: msg.isIdentityRevealed,
    sender: msg.isIdentityRevealed ? msg.sender : null,
    createdAt: msg.createdAt,
  };
}

/**
 * 1) Send Anonymous Message
 * POST /api/messages
 * Allows an authenticated user to send an anonymous message to another registered user.
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { receiverId, content } = req.body;

    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({ message: 'receiverId and content are required' });
    }
    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ message: 'Invalid receiverId' });
    }
    if (req.user._id.equals(receiverId)) {
      return res.status(400).json({ message: 'Cannot send an anonymous message to yourself' });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver user not found' });
    }

    const message = await Message.create({
      sender: req.user._id,
      receiver: receiver._id,
      content: content.trim(),
    });

    res.status(201).json({
      message: {
        _id: message._id,
        receiver: receiver._id,
        content: message.content,
        isIdentityRevealed: message.isIdentityRevealed,
        createdAt: message.createdAt,
      },
    });
  })
);

/**
 * GET /api/messages/received
 * Retrieve all anonymous messages received by the current user.
 * Sender identity is hidden unless the sender accepted an identity request.
 */
router.get(
  '/received',
  authenticate,
  asyncHandler(async (req, res) => {
    const messages = await Message.find({ receiver: req.user._id })
      .populate('sender', 'name email')
      .sort({ createdAt: -1 });

    res.json({ messages: messages.map(formatReceivedMessage) });
  })
);

/**
 * GET /api/messages/:id
 * Retrieve a specific message (only accessible to its receiver or sender).
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid message ID' });
    }

    const msg = await Message.findById(req.params.id)
      .populate('sender', 'name email')
      .populate('receiver', 'name email');

    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const isSender = msg.sender._id.equals(req.user._id);
    const isReceiver = msg.receiver._id.equals(req.user._id);
    if (!isSender && !isReceiver) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (isReceiver && !isSender) {
      return res.json({ message: formatReceivedMessage(msg) });
    }

    res.json({ message: msg });
  })
);

export default router;
