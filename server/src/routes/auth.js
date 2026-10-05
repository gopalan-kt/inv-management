import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/auth.js';

// Auth routes are PUBLIC — they create and verify credentials, so they sit
// outside the org-scoped section of the API.
export function authRouter(db) {
  const router = Router();

  router.post('/register', validate({
    body: z.object({
      orgName: z.string().trim().min(1).max(120),
      name: z.string().trim().max(120).optional(),
      email: z.string().trim().toLowerCase().email().max(200),
      password: z.string().min(8).max(200),
    }).strict(),
  }), (req, res) => {
    res.status(201).json(authService.register(db, req.validated.body));
  });

  router.post('/login', validate({
    body: z.object({
      email: z.string().trim().toLowerCase().email().max(200),
      password: z.string().min(1).max(200),
    }).strict(),
  }), (req, res) => {
    res.json(authService.login(db, req.validated.body));
  });

  return router;
}
