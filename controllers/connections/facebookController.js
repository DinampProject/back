/**
 * Facebook / Messenger Controller
 * שומר את פרטי-החיבור בתוך user.connections (ללא מודל נפרד)
 */
import axios from 'axios';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import User from '../../models/User.js';

/* ---------------------------------------------------- */
/* ENV                                                 */
const {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_REDIRECT_URI,
  FACEBOOK_VERIFY_TOKEN, // עבור Webhook
} = process.env;

/* גרסת Graph API העדכנית (v22.0 – מאפריל 2025) */
const FB_VERSION = 'v22.0';
const FB_DIALOG_URL = `https://www.facebook.com/${FB_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_VERSION}`;

/* ---------------------------------------------------- */
/* 1) GET /api/connections/facebook/auth-url           */
/* ---------------------------------------------------- */
export const getFacebookAuthUrl = asyncHandler((req, res) => {
  console.log('AppID from env →', process.env.FACEBOOK_APP_ID);

  const state = crypto.randomBytes(8).toString('hex'); // CSRF
  req.session.fbState = state;

  // שימוש בהרשאה בסיסית בלבד כפתרון זמני
  const scope = ['public_profile'].join(',');

  const url =
    `${FB_DIALOG_URL}?client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&state=${state}&scope=${encodeURIComponent(scope)}`;

  /* DEBUG בלבד – להסיר בפרודקשן */
  console.log('OAuth URL →', url);

  res.json({ url });
});

/* ---------------------------------------------------- */
/* 2)  POST /api/connections/facebook/exchange-code      */
/*     (לא נוגעים בפרונט־אנד)                            */
/* ---------------------------------------------------- */
export const exchangeFacebookCode = asyncHandler(async (req, res) => {
  /* -------------------------------------------------- */
  /* 1. איסוף-פרמטרים ממקורות שונים                    */
  /* -------------------------------------------------- */
  // ①  code יכול להגיע בגוף או כ-query
  const code =
    req.body.code ??
    req.body.authorizationCode ??                // fallback אפשרי
    req.query.code;

  // ②  uid ננסה להשיג מגוף-הבקשה, מה-session או מהמזהה
  //     שהתווסף ע״י מידלווייר אימות (למשל JWT / Firebase)
  let uid =
    req.body.uid ??
    req.session?.userId ??
    req.user?.id ??                              // req.user = { id, email, … }
    req.user?.uid;                               // במקרה Firebase

  /* -------------------------------------------------- */
  /* 2. בדיקה בסיסית                                   */
  /* -------------------------------------------------- */
  if (!code || !uid) {
    return res
      .status(400)
      .json({ message: 'Missing required parameters: code, uid' });
  }

  /* 3. (אופציונלי) מחיקת fbState אם קיים */
  delete req.session?.fbState;

  /* -------------------------------------------------- */
  /* 4. המשך ה-flow (ללא שינוי)                         */
  /* -------------------------------------------------- */

  try {
    /* 4-a – Short-lived user token */
    const { data: shortTok } = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id:     FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri:  FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    /* 4-b – Long-lived token */
    const { data: longTok } = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type:        'fb_exchange_token',
        client_id:         FACEBOOK_APP_ID,
        client_secret:     FACEBOOK_APP_SECRET,
        fb_exchange_token: shortTok.access_token,
      },
    });
    const userAccessToken = longTok.access_token;

    /* 4-c – Page token */
    const { data: pages } = await axios.get(`${FB_GRAPH_BASE}/me/accounts`, {
      params: { access_token: userAccessToken, fields: 'id,name,access_token' },
    });
    if (!pages.data?.length)
      return res.status(400).json({ message: 'No Facebook Pages found for this user' });

    const [{ id: pageId, name: pageName, access_token: pageAccessToken }] = pages.data;

    /* 4-d – עדכון במסד־הנתונים */
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const idx = user.connections.findIndex((c) => c.provider === 'facebook');
    const connData = {
      provider: 'facebook',
      pageId,
      pageName,
      pageAccessToken,
      userAccessToken,
      connectedAt: new Date(),
    };

    if (idx === -1) user.connections.push(connData);
    else user.connections[idx] = connData;

    await user.save();

    res.json({ pageId, pageName });
  } catch (err) {
    console.error('Exchange code error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ---------------------------------------------------- */
/* 3) POST /api/connections/facebook/notify             */
/*     body: { uid, psid, message }                    */
/* ---------------------------------------------------- */
export const sendFacebookNotification = asyncHandler(async (req, res) => {
  const { uid, psid, message } = req.body;
  if (!uid || !psid || !message) {
    return res.status(400).json({ message: 'uid, psid, message required' });
  }

  const user = await User.findById(uid).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const fbConn = user.connections?.find((c) => c.provider === 'facebook');
  if (!fbConn) {
    return res.status(404).json({ message: 'Facebook not connected for this user' });
  }

  try {
    await axios.post(
      `${FB_GRAPH_BASE}/me/messages`,
      {
        recipient: { id: psid },
        message: { text: message },
        messaging_type: 'MESSAGE_TAG',
        tag: 'ACCOUNT_UPDATE',
      },
      { params: { access_token: fbConn.pageAccessToken } }
    ).catch((err) => {
      throw new Error(`Failed to send message: ${err.response?.data?.error?.message || err.message}`);
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Send notification error:', error.message);
    res.status(500).json({ message: error.message });
  }
});

/* ---------------------------------------------------- */
/* 4) POST /api/connections/facebook/disconnect         */
/*     body: { uid }                                   */
/* ---------------------------------------------------- */
export const disconnectFacebook = asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ message: 'uid required' });

  const user = await User.findById(uid);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.connections = user.connections.filter((c) => c.provider !== 'facebook');
  await user.save();

  res.json({ success: true });
});

/* ---------------------------------------------------- */
/* 5) GET/POST /api/connections/facebook/webhook        */
/*     Webhook לקבלת PSID ואירועי מסנג'ר            */
/* ---------------------------------------------------- */
export const facebookWebhook = asyncHandler(async (req, res) => {
  if (req.method === 'GET') {
    // Webhook verification
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ message: 'Verification failed' });
  }

  if (req.method === 'POST') {
    const { entry } = req.body;
    for (const evt of entry) {
      const messaging = evt.messaging?.[0];
      if (messaging) {
        const psid = messaging.sender.id; // Page-Scoped ID
        const pageId = messaging.recipient.id; // Page ID
        // עדכון ה-PSID במסד הנתונים
        await User.updateOne(
          { 'connections.provider': 'facebook', 'connections.pageId': pageId },
          { $set: { 'connections.$.psid': psid } }
        );
      }
    }
    res.status(200).json({ success: true });
  }
});