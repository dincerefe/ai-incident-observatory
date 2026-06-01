const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = require('./db');
const incidentsRouter = require('./routes/incidents');
const syncRouter = require('./routes/sync');
const ethicsRouter = require('./routes/ethics');

const app = express();
const PORT = process.env.PORT || 3000;

// Gzip all responses — biggest single win for large JSON payloads
app.use(compression());

// Enable CORS for development flexibility
app.use(cors());

// Parse JSON payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files — HTML always revalidated, assets cached 1 day
app.use(express.static(path.join(__dirname, '../public'), {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    }
  }
}));

// Mount API routes
app.use('/api/incidents', incidentsRouter);
app.use('/api/sync', syncRouter);
app.use('/api/ethics', ethicsRouter);

// Fallback for SPA routing or single-page static hosting
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Configure 6-hour auto-synchronization cron schedule
// '0 */6 * * *' = every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('[CRON] Automated synchronization scheduler triggered (6h interval)...');
  try {
    const { syncAll } = require('./scrapers');
    const stats = await syncAll();
    console.log('[CRON] Sync finished successfully:', stats);
  } catch (err) {
    console.error('[CRON] Auto sync error:', err.message);
  }
});

// Server boot orchestrator
async function startServer() {
  try {
    await db.ready;

    const countRow = await db.get('SELECT COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG"');
    const count = countRow ? countRow.count : 0;
    
    console.log(`Current incident count in database: ${count}`);

    // Seed if DB is empty or lacks primary data
    if (count < 10) {
      console.log('Database contains fewer than 10 records. Automatically triggering seed.js...');
      const { seed } = require('./seed');
      await seed();
    }

    // Load ethics questions + AI answers from CSV before serving requests
    const { loadEthicsFromCSV } = require('./seed');
    const forceReload = process.argv.includes('--reload-ethics');
    await loadEthicsFromCSV(forceReload);

    // Start Express listener only after core data is ready
    app.listen(PORT, '0.0.0.0', () => {
      console.log('\n🔭 ==========================================');
      console.log(`🔭 AI Incident Observatory running at http://localhost:${PORT}`);
      console.log('🔭 ==========================================\n');
    });

    // Trigger synchronization immediately on startup if config is enabled
    if (process.env.SYNC_ON_STARTUP === 'true') {
      console.log('SYNC_ON_STARTUP is enabled. Launching background synchronizers...');
      const { syncAll } = require('./scrapers');
      
      // Execute asynchronously so the server can accept traffic immediately.
      syncAll()
        .then(stats => {
          console.log('Background startup sync complete. Stats:', stats);
        })
        .catch(err => {
          console.error('Background startup sync encountered an error:', err.message);
        });
    }

  } catch (err) {
    console.error('Server startup crash:', err.message);
    process.exit(1);
  }
}

startServer();
