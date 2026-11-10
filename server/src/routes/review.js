import { Router } from 'express';
import { Rating } from '../services/srs.js';
import { badRequest, notFound } from '../utils/input.js';

const VALID_RATINGS = new Set(Object.values(Rating));

export function reviewRouter(review) {
  const router = Router();

  router.get('/next', (_req, res) => res.json(review.next()));

  router.post('/:id', (req, res) => {
    const rating = Number(req.body.rating);
    if (!VALID_RATINGS.has(rating)) throw badRequest('Note invalide');
    if (!review.answer(req.params.id, rating)) throw notFound('Carte');
    res.json({ ok: true });
  });

  return router;
}

export function statsRouter(review) {
  return Router().get('/', (_req, res) => res.json(review.stats()));
}
