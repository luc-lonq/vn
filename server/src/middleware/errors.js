// Express recognizes error handlers by their arity, so all four parameters are required.
export function errorHandler(err, _req, res, _next) {
  if (err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur' });
}
