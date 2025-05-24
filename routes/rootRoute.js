import express from 'express';

import connectionsRoute from './connectionsRoute.js';   // ⬅ NEW

const router = express.Router();

router.use('/connections', connectionsRoute);

export default router;
