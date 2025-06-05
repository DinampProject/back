import mongoose from 'mongoose';

export const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    default: '',
  },
  url: {
    type: String,
    required: true,
    default: '',
  },
  clientInfo: {
    userId: {
      type: String,
      required: false,    // no longer required/unique here
      trim: true,
    },
    name: {
      type: String,
      required: true,
      default: '',
    },
    email: { type: String, default: '' },
    phoneNumber: { type: String, default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    country: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
  description: {
    type: String,
    required: true,
    default: '',
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  status: {
    type: String,
    required: true,
    default: 'Active',
  },
  budget: {
    type: Number,
    required: true,
    default: 0,
  },
  kpis: {
    type: Number,
    required: true,
    default: 0,
  },
  insights: {
    type: Number,
    required: true,
    default: 0,
  },
});
