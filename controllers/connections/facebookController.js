import axios from 'axios';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import User from '../../models/user.js';

/* ---------------------------------------------------- */
/* ENV                                                  */
const {
  FACEBOOK_APP_ID,
  FACEBOOK_APP_SECRET,
  FACEBOOK_REDIRECT_URI,
  FACEBOOK_VERIFY_TOKEN,
} = process.env;

/* Latest Graph-API version (April-2025) */
const FB_VERSION     = 'v22.0';
const FB_DIALOG_URL  = `https://www.facebook.com/${FB_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE  = `https://graph.facebook.com/${FB_VERSION}`;

/* ==================================================== */
/* 1) POST  /connections/facebook/auth-url              */
/* ==================================================== */
export const connectFacebookAccount = asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ message: 'uid is required' });

  /* ---------- build state & auth URL ---------- */
  const state  = JSON.stringify({ csrf: crypto.randomBytes(8).toString('hex'), uid });
  req.session.fbState = state;

  const scope  = [
  'public_profile',
  'pages_show_list',       // מחזיר עמודים
  'pages_manage_metadata', // נדרש לקבלת טוקן־עמוד
  'pages_read_engagement', // קריאה לפוסטים / אינבוקס
  'pages_messaging'        // שליחת הודעות
].join(',');
  const url    =
    `${FB_DIALOG_URL}?client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&state=${state}&scope=${encodeURIComponent(scope)}`;

  /* ---------- persist "pending" connection ---------- */
  const user = await User.findOne({ uid });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const payload = {
    provider: 'facebook',
    status:   'pending',
    authUrl:  url,
    connectedAt: null,
    pageId:   null,
    pageName: null,
    pageAccessToken: null,
    userAccessToken: null,
  };

  const ix = user.connections.findIndex(c => c.provider === 'facebook');
  ix === -1 ? user.connections.push(payload)
            : user.connections[ix] = { ...user.connections[ix], ...payload };

  await user.save();

  res.json({ url });        // front-end just needs this string
});

/* ==================================================== */
/* 2) POST /connections/facebook/exchange-code          */
/* ==================================================== */
export const exchangeFacebookCode = asyncHandler(async (req, res) => {
  /* Accept both URL-query and JSON body */
  const code   = req.query.code   || req.body.code;
  const state  = req.query.state  || req.body.state;
  let   uid    = req.body.uid     || null;

  if (!code) return res.status(400).json({ message: 'Missing "code"' });

  /* -------- state validation (if present) -------- */
  if (state) {
    const savedState = req.session?.fbState;
    if (!savedState || savedState !== state)
      return res.status(400).json({ message: 'Invalid state parameter' });

    try {
      const parsed = JSON.parse(state);
      uid = parsed.uid;
    } catch {
      return res.status(400).json({ message: 'Invalid state JSON' });
    }
    delete req.session.fbState;          // cleanup
  }
  if (!uid) return res.status(400).json({ message: 'uid missing' });

  /* -------- exchange code for long-lived token -------- */
  try {
    /* 1. short-lived */
    const { data: shortTok } = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        client_id:     FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri:  FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    /* 2. long-lived */
    const { data: longTok }  = await axios.get(`${FB_GRAPH_BASE}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id:     FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        fb_exchange_token: shortTok.access_token,
      },
    });
    const userAccessToken = longTok.access_token;

    /* 3. fetch first page that the user manages */
    const { data: pages } = await axios.get(`${FB_GRAPH_BASE}/me/accounts`, {
      params: { access_token: userAccessToken, fields: 'id,name,access_token' },
    });
    if (!pages.data?.length)
      return res.status(400).json({ message: 'No Facebook Pages found' });

    const [{ id: pageId, name: pageName, access_token: pageAccessToken }] = pages.data;

    /* -------- persist connection -------- */
    const user = await User.findOne({ uid });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const conn = {
      provider: 'facebook',
      status:   'connected',
      pageId,
      pageName,
      pageAccessToken,
      userAccessToken,
      connectedAt: new Date(),
    };

    const ix = user.connections.findIndex(c => c.provider === 'facebook');
    ix === -1 ? user.connections.push(conn)
              : user.connections[ix] = conn;

    await user.save();

    res.json({ pageId, pageName, status: 'connected' });
  } catch (err) {
    console.error('Exchange code error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ==================================================== */
/* 3) POST /connections/facebook/notify                 */
/* ==================================================== */
export const sendFacebookNotification = asyncHandler(async (req, res) => {
  const { uid, psid, message } = req.body;
  if (!uid || !psid || !message)
    return res.status(400).json({ message: 'uid, psid, message required' });

  const user   = await User.findById(uid).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const fbConn = user.connections?.find(c => c.provider === 'facebook');
  if (!fbConn)
    return res.status(404).json({ message: 'Facebook not connected' });

  try {
    await axios.post(
      `${FB_GRAPH_BASE}/me/messages`,
      {
        recipient: { id: psid },
        message:   { text: message },
        messaging_type: 'MESSAGE_TAG',
        tag: 'ACCOUNT_UPDATE',
      },
      { params: { access_token: fbConn.pageAccessToken } },
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Send notification error:', e.message);
    res.status(500).json({ message: e.message });
  }
});

/* ==================================================== */
/* 4) POST /connections/facebook/disconnect             */
/* ==================================================== */
export const disconnectFacebook = asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ message: 'uid required' });

  const user = await User.findOneAndUpdate(
    { uid },
    { $pull: { connections: { provider: 'facebook' } } },
    { new: true },
  );
  if (!user) return res.status(404).json({ message: 'User not found' });

  res.json({ success: true });
});

/* ==================================================== */
/* 5) GET/POST /connections/facebook/webhook            */
/* ==================================================== */
export const facebookWebhook = asyncHandler(async (req, res) => {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === FACEBOOK_VERIFY_TOKEN)
      return res.status(200).send(challenge);
    return res.status(403).json({ message: 'Verification failed' });
  }

  if (req.method === 'POST') {
    const { entry } = req.body;
    for (const evt of entry) {
      const messaging = evt.messaging?.[0];
      if (!messaging) continue;
      const psid   = messaging.sender.id;
      const pageId = messaging.recipient.id;
      await User.updateOne(
        { 'connections.provider': 'facebook', 'connections.pageId': pageId },
        { $set: { 'connections.$.psid': psid } },
      );
    }
    res.status(200).json({ success: true });
  }
});
