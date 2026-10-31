import mongoose from 'mongoose';
import { env } from './env.js';
export const connectDatabase = () => mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
