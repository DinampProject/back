/**
 * Facebook / Messenger Controller
 * שומר את פרטי-החיבור בתוך user.connections  (ללא מודל נפרד)
 */
import axios from 'axios';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import User from '../../models/User.js';

/* ---------------------------------------------------- */
/*  ENV                                                 */
const {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_REDIRECT_URI,
} = process.env;

/*  גרסת Graph API העדכנית (v22.0 – מאפריל 2025)  */  // :contentReference[oaicite:0]{index=0}
const FB_VERSION    = 'v22.0';
const FB_DIALOG_URL = `https://www.facebook.com/${FB_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE = `https://graph.facebook.com/${FB_VERSION}`;

/* ---------------------------------------------------- */
/* 1)  GET  /api/connections/facebook/auth-url           */
/* ---------------------------------------------------- */
export const getFacebookAuthUrl = asyncHandler((req, res) => {
  console.log('AppID from env →', process.env.FACEBOOK_APP_ID);

  const state = crypto.randomBytes(8).toString('hex'); // CSRF
  req.session.fbState = state;

  const scope = [
    'public_profile',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
  ].join(',');

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
/*     body: { code, uid }                               */
/* ---------------------------------------------------- */
export const exchangeFacebookCode = asyncHandler(async (req, res) => {
  const { code, uid } = req.body;
  if (!code || !uid) return res.status(400).json({ message: 'code + uid required' });

  /* 2-a ▸ אסימון-משתמש קצר-טווח */
  const { data: shortTok } = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
    params: {
      client_id:     FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri:  FACEBOOK_REDIRECT_URI,
      code,
    },
  });

  /* 2-b ▸ החלפה לאסימון ארוך-טווח (60 ימים) */
  const { data: longTok } = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type:        'fb_exchange_token',
      client_id:         FACEBOOK_APP_ID,
      client_secret:     FACEBOOK_APP_SECRET,
      fb_exchange_token: shortTok.access_token,
    },
  });
  const userAccessToken = longTok.access_token;

  /* 2-c ▸ שליפת רשימת הדפים של המשתמש + Page Token */
  const { data: pages } = await axios.get(`${FB_GRAPH_BASE}/me/accounts`, {
    params: { access_token: userAccessToken, fields: 'id,name,access_token' },
  });
  if (!pages.data?.length)
    return res.status(400).json({ message: 'No Facebook Pages found for this user' });

  /* MVP – מחברים את הדף הראשון */
  const [{ id: pageId, name: pageName, access_token: pageAccessToken }] = pages.data;

  /* 2-d ▸ שמירה במסד-הנתונים (בתוך user.connections) */
  const user = await User.findById(uid);
  if (!user) return res.status(404).json({ message: 'User not found' });

  /* האם יש כבר חיבור Facebook? */
  const idx = user.connections.findIndex((c) => c.provider === 'facebook');

  const connData = {
    provider:        'facebook',
    pageId,
    pageName,
    pageAccessToken,
    userAccessToken,
    connectedAt:     new Date(),
  };

  if (idx === -1) user.connections.push(connData);
  else            user.connections[idx] = connData;

  await user.save();

  res.json({ pageId, pageName });
});

/* ---------------------------------------------------- */
/* 3)  POST /api/connections/facebook/notify             */
/*     body: { uid, psid, message }                      */
/* ---------------------------------------------------- */
export const sendFacebookNotification = asyncHandler(async (req, res) => {
  const { uid, psid, message } = req.body;
  if (!uid || !psid || !message)
    return res.status(400).json({ message: 'uid, psid, message required' });

  const user = await User.findById(uid).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const fbConn = user.connections?.find((c) => c.provider === 'facebook');
  if (!fbConn)
    return res.status(404).json({ message: 'Facebook not connected for this user' });

  await axios.post(
    `${FB_GRAPH_BASE}/me/messages`,
    {
      recipient: { id: psid },       // Page-Scoped ID
      message:   { text: message },
      messaging_type: 'MESSAGE_TAG',
      tag:            'ACCOUNT_UPDATE',
    },
    { params: { access_token: fbConn.pageAccessToken } }
  );

  res.json({ success: true });
});

/* ---------------------------------------------------- */
/* 4)  POST /api/connections/facebook/disconnect         */
/*     body: { uid }                                     */
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
