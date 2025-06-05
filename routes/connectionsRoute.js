// routes/connectionsRoute.js
import express from 'express';
import {
  connectFacebookAccount,
  exchangeFacebookCode,
  sendFacebookNotification,
  disconnectFacebook,
  facebookWebhook,               // ייבוא הפונקציה החדשה
} from '../controllers/connections/facebookController.js';

import {
  getWhatsappAuthUrl,
  exchangeWhatsappCode,
  sendWhatsappNotification,
  disconnectWhatsapp,
  whatsappWebhook,
} from '../controllers/connections/whatsappController.js';

// ⚠️  Placeholder controllers for the other platforms
// import * as googleController   from '../controllers/connections/googleController.js';
// import * as linkedinController from '../controllers/connections/linkedinController.js';
// …etc

const router = express.Router();

/* ------------------------------------------------------------------ */
/* FACEBOOK                                                            */
/* ------------------------------------------------------------------ */

/**
 * @swagger
 * tags:
 *   name: Connections
 *   description: Connect / disconnect social-media platforms
 */

/**
 * @swagger
 * /api/connections/facebook/connectFacebookAccount:
 *   post:
 *     summary: Get the Facebook OAuth dialog URL
 *     tags: [Connections]
 *     description: Returns the fully-qualified URL that the client must open so the user can grant permissions.
 *     responses:
 *       200:
 *         description: URL generated successfully
 */
router.post('/facebook/connectFacebookAccount', connectFacebookAccount);

/**
 * @swagger
 * /api/connections/facebook/exchange-code:
 *   post:
 *     summary: Exchange FB "code" for a long-lived Page token
 *     tags: [Connections]
 *     description: Receives the short-lived user access-token or "code" from the front-end and returns a Page token the server can store.
 *     responses:
 *       200:
 *         description: Token stored successfully
 */
router.post('/facebook/exchange-code', exchangeFacebookCode);

/**
 * @swagger
 * /api/connections/facebook/notify:
 *   post:
 *     summary: Send a Messenger notification
 *     tags: [Connections]
 *     description: Fires the Messenger Send API using the server-side Page token.
 *     responses:
 *       200:
 *         description: Notification sent
 */
router.post('/facebook/notify', sendFacebookNotification);

/**
 * @swagger
 * /api/connections/facebook/disconnect:
 *   post:
 *     summary: Remove FB credentials
 *     tags: [Connections]
 *     description: Deletes stored tokens and severs the connection.
 *     responses:
 *       200:
 *         description: Disconnected
 */
router.post('/facebook/disconnect', disconnectFacebook);

/**
 * @swagger
 * /api/connections/facebook/webhook:
 *   get:
 *     summary: Verify Facebook Webhook
 *     tags: [Connections]
 *     description: Endpoint for Facebook to GET during webhook setup (hub.challenge).
 *     responses:
 *       200:
 *         description: Returns hub.challenge value if verify_token matches.
 *       403:
 *         description: Verification failed.
 *   post:
 *     summary: Handle incoming Messenger events
 *     tags: [Connections]
 *     description: Receives real-time messages from users (PSID) and stores them.
 *     responses:
 *       200:
 *         description: Event received.
 */
router
  .route('/facebook/webhook')
  .get(facebookWebhook)
  .post(facebookWebhook);

/* ------------------------------------------------------------------ */
/* TODO — Google / LinkedIn / TikTok / X / …                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* WHATSAPP                                                           */
/* ------------------------------------------------------------------ */
/* OAuth + token exchange */
router.post('/whatsapp/auth-url', getWhatsappAuthUrl);
router.post('/whatsapp/exchange-code', exchangeWhatsappCode);

/* Messaging + disconnect */
router.post('/whatsapp/notify', sendWhatsappNotification);
router.post('/whatsapp/disconnect', disconnectWhatsapp);

/* Webhook (Meta → your app) */
router
  .route('/whatsapp/webhook')
  .get(whatsappWebhook)
  .post(whatsappWebhook);

export default router;
