import mongoose from 'mongoose';

/**
 * Connect to MongoDB using the configured MONGODB_URI.
 */
export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error('MONGODB_URI is not defined');
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}
