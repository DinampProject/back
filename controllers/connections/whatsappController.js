/**
 * WhatsApp Business Cloud Controller
 * שומר את פרטי-החיבור בתוך user.connections (ללא מודל נפרד)
 */
import axios from 'axios';
import crypto from 'crypto';
import asyncHandler from 'express-async-handler';
import User from '../../models/User.js';

/* ---------------------------------------------------- */
/* ENV                                                  */
const {
  WHATSAPP_APP_ID,          // usually the same App-ID as Facebook
  WHATSAPP_APP_SECRET,
  WHATSAPP_REDIRECT_URI,
  WHATSAPP_VERIFY_TOKEN,    // עבור Webhook
} = process.env;

/* גרסת Graph API העדכנית (v22.0 – מאפריל 2025) */
const FB_VERSION   = 'v22.0';
const FB_DIALOG_URL  = `https://www.facebook.com/${FB_VERSION}/dialog/oauth`;
const FB_GRAPH_BASE  = `https://graph.facebook.com/${FB_VERSION}`;

export const getWhatsappAuthUrl = asyncHandler((req, res) => {
  const state = crypto.randomBytes(8).toString('hex'); // CSRF
  req.session.waState = state;

  const scope = [
    'whatsapp_business_management',
    'whatsapp_business_messaging',
  ].join(',');

  const url =
    `${FB_DIALOG_URL}?client_id=${WHATSAPP_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(WHATSAPP_REDIRECT_URI)}` +
    `&state=${state}&scope=${encodeURIComponent(scope)}`;

  res.json({ url });
});

/* ---------------------------------------------------- */
/* 2) POST /api/connections/whatsapp/exchange-code      */
/* ---------------------------------------------------- */
export const exchangeWhatsappCode = asyncHandler(async (req, res) => {
  /* 1. parameters */
  const code =
    req.body.code ??
    req.body.authorizationCode ??
    req.query.code;

  let uid =
    req.body.uid ??
    req.session?.userId ??
    req.user?.id ??
    req.user?.uid;

  if (!code || !uid) {
    return res
      .status(400)
      .json({ message: 'Missing required parameters: code, uid' });
  }

  delete req.session?.waState;  // once used, drop the stored state

  try {
    /* 2-a – short-lived user token */
    const { data: shortTok } = await axios.get(
      `${FB_GRAPH_BASE}/oauth/access_token`,
      {
        params: {
          client_id:     WHATSAPP_APP_ID,
          client_secret: WHATSAPP_APP_SECRET,
          redirect_uri:  WHATSAPP_REDIRECT_URI,
          code,
        },
      }
    );

    /* 2-b – long-lived token */
    const { data: longTok } = await axios.get(
      `${FB_GRAPH_BASE}/oauth/access_token`,
      {
        params: {
          grant_type:        'fb_exchange_token',
          client_id:         WHATSAPP_APP_ID,
          client_secret:     WHATSAPP_APP_SECRET,
          fb_exchange_token: shortTok.access_token,
        },
      }
    );
    const userAccessToken = longTok.access_token;

    /* 2-c – fetch first WABA & phone-number-id */
    const { data: profile } = await axios.get(
      `${FB_GRAPH_BASE}/me`,
      {
        params: {
          access_token: userAccessToken,
          fields:
            'id,name,whatsapp_business_accounts{name,id,phone_numbers{display_phone_number,id,verified_name}}',
        },
      }
    );

    const waba = profile?.whatsapp_business_accounts?.data?.[0];
    if (!waba) {
      return res
        .status(400)
        .json({ message: 'No WhatsApp Business Account found for this user' });
    }

    const phone = waba.phone_numbers?.data?.[0];
    if (!phone) {
      return res
        .status(400)
        .json({ message: 'No phone number found in the WABA' });
    }

    const phoneNumberId       = phone.id;
    const displayPhoneNumber  = phone.display_phone_number;
    const wabaId              = waba.id;

    /* 2-d – update user document */
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const idx = user.connections.findIndex((c) => c.provider === 'whatsapp');
    const connData = {
      provider:          'whatsapp',
      wabaId,
      phoneNumberId,
      displayPhoneNumber,
      userAccessToken,   // long-lived user token (60d)
      connectedAt:       new Date(),
    };

    if (idx === -1) user.connections.push(connData);
    else             user.connections[idx] = connData;

    await user.save();

    res.json({ phoneNumberId, displayPhoneNumber, wabaId });
  } catch (err) {
    console.error('WhatsApp exchange-code error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

/* ---------------------------------------------------- */
/* 3) POST /api/connections/whatsapp/notify             */
/*     body: { uid, to, templateName, languageCode, components } */
/* ---------------------------------------------------- */
export const sendWhatsappNotification = asyncHandler(async (req, res) => {
  const {
    uid,
    to,                           // recipient phone in E.164 e.g. "+15551234567"
    templateName   = 'hello_world',
    languageCode   = 'en_US',
    components     = [],
  } = req.body;

  if (!uid || !to || !templateName) {
    return res
      .status(400)
      .json({ message: 'uid, to, templateName are required' });
  }

  const user = await User.findById(uid).lean();
  if (!user) return res.status(404).json({ message: 'User not found' });

  const waConn = user.connections?.find((c) => c.provider === 'whatsapp');
  if (!waConn) {
    return res
      .status(404)
      .json({ message: 'WhatsApp not connected for this user' });
  }

  try {
    await axios.post(
      `${FB_GRAPH_BASE}/${waConn.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name:     templateName,
          language: { code: languageCode },
          components,
        },
      },
      { params: { access_token: waConn.userAccessToken } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('WhatsApp send error:', error.response?.data || error.message);
    res
      .status(500)
      .json({ message: error.response?.data?.error?.message || error.message });
  }
});

/* ---------------------------------------------------- */
/* 4) POST /api/connections/whatsapp/disconnect         */
/*     body: { uid }                                    */
/* ---------------------------------------------------- */
export const disconnectWhatsapp = asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ message: 'uid required' });

  const user = await User.findById(uid);
  if (!user) return res.status(404).json({ message: 'User not found' });

  user.connections = user.connections.filter(
    (c) => c.provider !== 'whatsapp'
  );
  await user.save();

  res.json({ success: true });
});

/* ---------------------------------------------------- */
/* 5) GET/POST /api/connections/whatsapp/webhook        */
/*     Webhook אימות וקבלת אירועים                  */
/* ---------------------------------------------------- */
export const whatsappWebhook = asyncHandler(async (req, res) => {
  /* 5-a – verification (GET) */
  if (req.method === 'GET') {
    const {
      'hub.mode':      mode,
      'hub.verify_token': token,
      'hub.challenge':   challenge,
    } = req.query;

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ message: 'Verification failed' });
  }

  /* 5-b – incoming events (POST) */
  if (req.method === 'POST') {
    /* WhatsApp sends messages / statuses in an array of entry objects */
    const { entry } = req.body;

    for (const evt of entry) {
      const changes = evt?.changes?.[0];
      if (!changes) continue;

      /* Example: store the customer phone (wa_id) the first time we see it */
      const waMessage = changes?.value?.messages?.[0];
      if (waMessage) {
        const fromWaId = waMessage.from;          // "wa_id" of the sender
        const phoneNum = waMessage?.to;           // your business number
        await User.updateOne(
          { 'connections.provider': 'whatsapp', 'connections.phoneNumberId': phoneNum },
          { $set: { 'connections.$.lastCustomerWaId': fromWaId } }
        );
      }
    }

    res.status(200).json({ success: true });
  }
});
