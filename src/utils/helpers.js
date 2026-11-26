import mongoose from 'mongoose';

/**
 * Validate that a string is a valid MongoDB ObjectId.
 */
export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Express async handler wrapper to forward errors to global error middleware.
 */
export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
