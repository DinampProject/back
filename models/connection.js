import mongoose from "mongoose";
import encrypt from "mongoose-encryption";

export const connectionSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    pageId: String,
    pageName: String,
    pageAccessToken: String,
    userAccessToken: String,
    extra: mongoose.Schema.Types.Mixed,
    connectedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const secret = process.env.ENCRYPTION_SECRET;
if (!secret) {
  throw new Error("ENCRYPTION_SECRET must be set in environment variables");
}

connectionSchema.plugin(encrypt, {
  secret,
  encryptedFields: ["pageAccessToken", "userAccessToken"],
});
