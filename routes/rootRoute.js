import express from 'express';

import connectionsRoute from './connectionsRoute.js';   // ⬅ NEW
import authRoute from './authRoute.js';
// import clientRoute from './clientRoute.js';
// import campaignRoute from './campaignRoute.js';
const router = express.Router();

router.use('/auth', authRoute); // AUTHENTICATION   
router.use('/connections', connectionsRoute); // CONNECTIONS
// router.use('/client', clientRoute); // clients
// router.use('/campaign', campaignRoute); // users

export default router;
