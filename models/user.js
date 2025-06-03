import mongoose from 'mongoose';
import { connectionSchema } from './connection.js';
import { clientSchema } from './client.js';

const userSchema = new mongoose.Schema(
  {
    uid:    { type: String, required: true, trim: true },
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    image:  String,         
    connections: [connectionSchema],
    clients: [clientSchema],
    settings: {
      language:      { type: String, default: 'en' },
      notifications: { type: Boolean, default: true },
      theme:         { type: String, enum: ['light', 'dark'], default: 'light' },
    },
  },
  { timestamps: true, _id: true }
);

const User = mongoose.models.user || mongoose.model('user', userSchema);

export default User;


