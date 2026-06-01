const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncAll } = require('../scrapers');

// POST /api/sync — Triggers synchronizers and deduplication pipeline
router.post('/', async (req, res) => {
  console.log('Sync manually triggered via REST API POST /api/sync');
  try {
    const results = await syncAll();
    res.json(results);
  } catch (err) {
    res.status(500).json({ 
      error: 'Data synchronization failed', 
      message: err.message,
      added: 0,
      skipped: 0,
      errors: [err.message]
    });
  }
});

// GET /api/sync/status — Return last sync time and database stats by source
router.get('/status', async (req, res) => {
  try {
    // Retrieve the latest synchronization log entry
    const lastLog = await db.get('SELECT description, created_at FROM incidents WHERE title = "OBSERVATORY_SYNC_LOG" ORDER BY id DESC LIMIT 1');
    
    // Retrieve database counts grouped by ingestion source
    const sourceRows = await db.all('SELECT source, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY source');
    
    const sourceCounts = {
      aiid: 0,
      aiaaic: 0,
      manual: 0,
      scraped: 0
    };

    sourceRows.forEach(row => {
      if (row.source in sourceCounts) {
        sourceCounts[row.source] = row.count;
      }
    });

    let lastSyncTime = null;
    let lastSyncStats = null;

    if (lastLog) {
      lastSyncTime = lastLog.created_at;
      try {
        lastSyncStats = JSON.parse(lastLog.description);
        // If logged timestamp is nested, override lastSyncTime
        if (lastSyncStats.timestamp) {
          lastSyncTime = lastSyncStats.timestamp;
        }
      } catch (e) {
        lastSyncStats = null;
      }
    }

    res.json({
      lastSyncTime,
      lastSyncStats,
      sourceCounts
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve sync status', message: err.message });
  }
});

module.exports = router;
