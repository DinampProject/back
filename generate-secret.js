import crypto from 'crypto';

// Generate a 32-byte (256-bit) key as a hex string
const secret = crypto.randomBytes(32).toString('hex');
console.log('ENCRYPTION_SECRET:', secret);