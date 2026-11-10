import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { cardsRouter } from './routes/cards.js';
import { historyRouter } from './routes/history.js';
import { notesRouter } from './routes/notes.js';
import { reviewRouter, statsRouter } from './routes/review.js';
import { createHistory } from './services/history.js';
import { createReviewService } from './services/review.js';

/** Serves the built frontend, falling back to index.html for client-side routes. */
function serveFrontend(app, dir) {
  app.use('/assets', express.static(path.join(dir, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(dir, { index: false }));
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dir, 'index.html'));
  });
}

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  // Exactly one reverse proxy in front (nginx in prod, Vite in dev). Trusting more
  // would let clients spoof X-Forwarded-For and dodge the login rate limit.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const history = createHistory(db);
  const review = createReviewService(db, config);
  const auth = createAuth(config);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth.router);

  const api = express.Router();
  api.use(auth.requireAuth);
  api.use('/notes', notesRouter(db, history));
  api.use('/cards', cardsRouter(db, history));
  api.use('/review', reviewRouter(review));
  api.use('/stats', statsRouter(review));
  api.use('/history', historyRouter(db));
  api.use((_req, res) => res.status(404).json({ error: 'Route inconnue' }));
  app.use('/api', api);

  if (config.staticDir) {
    const dir = path.resolve(config.staticDir);
    if (fs.existsSync(dir)) serveFrontend(app, dir);
  }

  app.use(errorHandler);
  return app;
}
