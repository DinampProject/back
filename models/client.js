import mongoose from "mongoose";
import { campaignSchema } from "./campaign.js";

export const clientSchema = new mongoose.Schema({
  userId: {
    type: String,
    default: "",
    trim: true,        // optional now
  },
  name: {
    type: String,
    default: "",
    trim: true,
  },
  email: { type: String, default: "" },
  phoneNumber: { type: String, default: "" },
  address: { type: String, default: "" },
  city: { type: String, default: "" },
  country: { type: String, default: "" },
  postalCode: { type: String, default: "" },
  campaigns: {
    type: [campaignSchema],
    default: [],
  },
});
