import mongoose from 'mongoose';
import { connectionSchema } from './connection.js';

const userSchema = new mongoose.Schema(
  {
    /*  ►  הנתונים שהגיעו במסך הכניסה עם Google OAuth  */
    name:   { type: String, required: true, trim: true },
    email:  { type: String, required: true, unique: true, lowercase: true, trim: true },
    image:  String,           // כתובת התמונה מגוגל

    /*  ►  מערך החיבורים (Facebook וכו׳)  */
    connections: [connectionSchema],

    /*  ►  לקוחות / פרויקטים של אותו משתמש (אופציונלי) */
    clients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }],

    /*  ►  הגדרות נוספות – חופשי  */
    settings: {
      language:      { type: String, default: 'en' },
      notifications: { type: Boolean, default: true },
      theme:         { type: String, enum: ['light', 'dark'], default: 'light' },
    },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
