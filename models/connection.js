import mongoose from 'mongoose';
export const connectionSchema = new mongoose.Schema(
  {
    provider:        { type: String, required: true }, // 'facebook', 'google' …
    /* ↓  שדות ייחודיים לפייסבוק; שדות אחרים אפשר לשמור ב-extra */
    pageId:          String,
    pageName:        String,
    pageAccessToken: String,   // ✱ המלצה: הצפנה לפני שמירה
    userAccessToken: String,
    extra:           mongoose.Schema.Types.Mixed, // מקום גמיש לעתיד
    connectedAt:     { type: Date, default: Date.now },
  },
  { _id: true }                 
);