import express from 'express';
import * as crypto from 'crypto';
import cors from 'cors';
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import compression from 'compression';
import rootRoutes from './routes/rootRoute.js';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { createServer } from 'http'; // Add this line
import { Server } from 'socket.io'; // Add this line
import setupSwagger from './utils/swagger.js';
import cookieParser from 'cookie-parser';

dotenv.config();
const app = express();
connectDB();
const BACKEND_DEV_MODE = process.env.DEV_MODE || ''; // ✅ Read secret from backend `.env`
// ✅ Update CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-client-id',
    'x-client-secret',
    'x-dev-mode', // ✅ this is to get a secret value that only in dev environment
    'x-env-mode', // ✅ this is to get the environment name - dev, staging, prod...
    'X-Hashed-Payload',
    'X-Hashed-Response',
    'X-Hashed-URL',
  ],
  credentials: true,
};

const httpServer = createServer(app); // Create the HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-client-id',
      'x-client-secret',
      'x-dev-mode', // ✅ this is to get a secret value that only in dev environment
      'x-env-mode', // ✅ this is to get the environment name - dev, staging, prod...
      'X-Hashed-Payload',
      'X-Hashed-Response',
      'X-Hashed-URL',
    ],
    credentials: true,
  },
});
// ✅ Add response hashing middleware before initializing CORS// ✅ Function to hash data consistently// ✅ Function to hash data consistently
const hashData = (data) => {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(data, Object.keys(data).sort()))
    .digest('hex');
};

app.use(express.json({ limit: '20mb' })); // ✅ Ensures JSON body parsing
app.use(express.urlencoded({ limit: '20mb', extended: true })); // ✅ Parses URL-encoded requests
/*  Optional: still parse signed cookies elsewhere */
app.use(cookieParser(process.env.COOKIE_SECRET));

/*  ✱ FIX: provide secret here, too (NOT req.secret)  */
app.use(
  session({
    secret: process.env.SESSION_SECRET,     // <— required
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions',
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  })
);
// console.log('BACKEND_DEV_MODE:', BACKEND_DEV_MODE);
app.use((req, res, next) => {
  const FRONTEND_DEV_MODE = req.headers['x-dev-mode'] || '';
  const BACKEND_DEV_MODE = process.env.DEV_MODE || '';
  // console.log(FRONTEND_DEV_MODE, BACKEND_DEV_MODE);
  if (!FRONTEND_DEV_MODE || FRONTEND_DEV_MODE !== BACKEND_DEV_MODE) {
    // console.log('🔒 Secret Mismatch: Hiding real request details');

    req.headers['X-Hashed-URL'] = hashData(req.originalUrl);
    req.headers['X-Hashed-Payload'] = req.body && Object.keys(req.body).length > 0 ? hashData(req.body) : 'No Payload';

    // ✅ Convert req.body to a string before checking `.includes`
    const requestBodyString = JSON.stringify(req.body);

    if (requestBodyString.includes(`"hashed":true`)) {
      try {
        req.body = JSON.parse(requestBodyString.replace(`"hashed":true`, req.headers['X-Hashed-Payload']));
      } catch (error) {
        console.error('❌ Payload restoration failed:', error);
        return res.status(400).json({ message: 'Invalid JSON format' });
      }
    }
  }

  next();
});

// ✅ Now apply CORS after modifying headers
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // ← ADD THIS

app.use(
  compression({
    level: 9,
    threshold: 0,
    filter: (req, res) => {
      if (req.header['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);

setupSwagger(app); // ✅ Place Swagger setup BEFORE registering API routes
app.use('/api', rootRoutes);

export default httpServer; // Export the HTTP server
