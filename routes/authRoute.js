    // routes/authRoute.js
import express from 'express';
import { fetchUser } from '../controllers/auth/googleController.js';

const router = express.Router();
/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication
 */

/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     summary: Google OAuth
 *     tags: [Auth]
 *     description: Authenticate with Google OAuth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: User name
 *               email:
 *                 type: string
 *                 description: User email
 *               image:
 *                 type: string
 *                 description: User image
 *     responses:
 *       200:
 *         description: User details
 */
router.post('/fetchUser', fetchUser);

export default router;