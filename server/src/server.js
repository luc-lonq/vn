import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`Configuration error: ${err.message}`);
  process.exit(1);
}

const db = openDb(config.dbPath);
const server = createApp({ db, config }).listen(config.port, () => {
  console.log(`API listening on :${config.port}`);
});

// Close the database cleanly so the WAL is checkpointed on `docker stop`.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
