import { Router } from 'express';
import { IdentityRequest } from '../models/IdentityRequest.js';
import { Message } from '../models/Message.js';
import { Conversation } from '../models/Conversation.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, isValidObjectId } from '../utils/helpers.js';

const router = Router();

const ACTION_TO_STATUS = {
  accept: 'accepted',
  accepted: 'accepted',
  reject: 'rejected',
  rejected: 'rejected',
};

/**
 * 2) Request Sender Identity
 * POST /api/identity-requests
 * Receiver requests to know who sent a specific message (creates request with status 'pending').
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const { messageId } = req.body;
    if (!messageId || !isValidObjectId(messageId)) {
      return res.status(400).json({ message: 'Valid messageId is required' });
    }

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    if (!message.receiver.equals(req.user._id)) {
      return res.status(403).json({
        message: 'Only the message receiver can request the sender identity',
      });
    }

    const existing = await IdentityRequest.findOne({ message: message._id });
    if (existing) {
      return res.status(409).json({
        message: 'An identity request already exists for this message',
        request: existing,
      });
    }

    const request = await IdentityRequest.create({
      message: message._id,
      requester: req.user._id,
      sender: message.sender,
      status: 'pending',
    });

    res.status(201).json({ request });
  })
);

/**
 * 3) Get Requests
 * GET /api/identity-requests
 * Sender views all identity requests received from other users.
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const requests = await IdentityRequest.find({ sender: req.user._id })
      .populate('requester', 'name email')
      .populate('message', 'content createdAt')
      .sort({ createdAt: -1 });

    res.json({ requests });
  })
);

/**
 * GET /api/identity-requests/sent
 * Receiver views identity requests they created.
 * Sender identity is only populated if the request status is 'accepted'.
 */
router.get(
  '/sent',
  authenticate,
  asyncHandler(async (req, res) => {
    const requests = await IdentityRequest.find({ requester: req.user._id })
      .populate('sender', 'name email')
      .populate('message', 'content createdAt isIdentityRevealed')
      .sort({ createdAt: -1 });

    const sanitized = requests.map((r) => ({
      _id: r._id,
      message: r.message,
      status: r.status,
      sender: r.status === 'accepted' ? r.sender : null,
      respondedAt: r.respondedAt,
      createdAt: r.createdAt,
    }));

    res.json({ requests: sanitized });
  })
);

/**
 * 4) Accept or Reject Request & 5) Create Conversation on acceptance
 * PATCH /api/identity-requests/:id
 * Body: { action: 'accept' | 'reject' } (or { status: 'accepted' | 'rejected' })
 */
router.patch(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid request ID' });
    }

    const rawChoice = (req.body.action || req.body.status || '').toLowerCase().trim();
    const targetStatus = ACTION_TO_STATUS[rawChoice];
    if (!targetStatus) {
      return res.status(400).json({
        message: "Invalid action. Provide 'accept' or 'reject'.",
      });
    }

    const identityRequest = await IdentityRequest.findById(req.params.id);
    if (!identityRequest) {
      return res.status(404).json({ message: 'Identity request not found' });
    }

    if (!identityRequest.sender.equals(req.user._id)) {
      return res.status(403).json({
        message: 'Only the original message sender can accept or reject this request',
      });
    }

    if (identityRequest.status !== 'pending') {
      return res.status(400).json({
        message: `Request has already been ${identityRequest.status}`,
      });
    }

    identityRequest.status = targetStatus;
    identityRequest.respondedAt = new Date();
    await identityRequest.save();

    if (targetStatus === 'rejected') {
      return res.json({
        request: identityRequest,
        conversation: null,
        message: 'Request rejected; sender identity remains hidden',
      });
    }

    // Accepted: reveal sender identity on original message & create linked conversation
    await Message.findByIdAndUpdate(identityRequest.message, {
      isIdentityRevealed: true,
    });

    const conversation = await Conversation.create({
      originalMessage: identityRequest.message,
      participants: [identityRequest.sender, identityRequest.requester],
    });

    res.json({
      request: identityRequest,
      conversation,
      message: 'Request accepted; sender identity revealed and conversation created',
    });
  })
);

export default router;
