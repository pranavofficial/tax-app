import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

// Define a custom request type that includes auth information
export interface AuthRequest extends Request {
  auth?: {
    sub: string;
    [key: string]: any;
  };
}

// Create middleware for checking the JWT
export const authenticateUser = expressjwt({
  // Dynamically provide a signing key based on the kid in the header
  // and the signing keys provided by the JWKS endpoint
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }) as any,

  // Validate the audience and the issuer
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256'],
  requestProperty: 'auth'
});

// Error handler for authentication errors
export const handleAuthError: ErrorRequestHandler = (err, req, res, next) => {
  console.error('Auth error details:', {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
    headers: req.headers
  });

  if (err.name === 'UnauthorizedError') {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  next(err);
}; 