const express = require('express');
const router = express.Router();
const db = require('../db');

// Helper to sanitize tags input (expects JSON array string or array)
function formatTags(tagsInput) {
  if (!tagsInput) return JSON.stringify([]);
  if (Array.isArray(tagsInput)) return JSON.stringify(tagsInput);
  try {
    JSON.parse(tagsInput);
    return tagsInput; // already a valid JSON string
  } catch (e) {
    // Treat as comma separated values
    const list = String(tagsInput).split(',').map(t => t.trim()).filter(Boolean);
    return JSON.stringify(list);
  }
}

// GET /api/incidents — CRUD + complex filters + pagination
router.get('/', async (req, res) => {
  try {
    let selectColumns = '*';
    if (req.query.lightweight === 'true') {
      // affected_group included so stats panel works; source_url omitted (fetched on demand)
      selectColumns = 'id, title, SUBSTR(description, 1, 100) as description, developer, category, year, severity, affected_group, geography, tags, source';
    }
    let sql = `SELECT ${selectColumns} FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG"`;
    const params = [];

    // Filter by year (exact or range)
    if (req.query.year) {
      sql += ' AND year = ?';
      params.push(parseInt(req.query.year, 10));
    } else if (req.query.start_year && req.query.end_year) {
      sql += ' AND year BETWEEN ? AND ?';
      params.push(parseInt(req.query.start_year, 10), parseInt(req.query.end_year, 10));
    }

    // Filter by category
    if (req.query.category) {
      sql += ' AND category = ?';
      params.push(req.query.category);
    }

    // Filter by developer
    if (req.query.developer) {
      sql += ' AND developer = ?';
      params.push(req.query.developer);
    }

    // Filter by severity
    if (req.query.severity) {
      sql += ' AND severity = ?';
      params.push(parseInt(req.query.severity, 10));
    }

    // Filter by search keyword
    if (req.query.search) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR developer LIKE ? OR system_name LIKE ?)';
      const term = `%${req.query.search}%`;
      params.push(term, term, term, term);
    }

    sql += ' ORDER BY year DESC, id DESC';

    // Pagination support — page + pageSize, or legacy limit param
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : null;
    const page     = req.query.page     ? Math.max(1, parseInt(req.query.page, 10)) : null;

    if (pageSize && page) {
      // Count total rows for pagination envelope
      const countSql = sql.replace(/^SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM');
      const countRow = await db.get(countSql, params);
      const total = countRow ? countRow.total : 0;
      const pages = Math.ceil(total / pageSize);

      sql += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (page - 1) * pageSize);

      const rows = await db.all(sql, params);
      const parsedRows = rows.map(r => {
        try { r.tags = JSON.parse(r.tags || '[]'); } catch { r.tags = []; }
        return r;
      });

      res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json({ data: parsedRows, total, page, pages });
    }

    // Legacy: limit-based (kept for admin / other callers)
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 15000;
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = await db.all(sql, params);
    const parsedRows = rows.map(r => {
      try { r.tags = JSON.parse(r.tags || '[]'); } catch { r.tags = []; }
      return r;
    });

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(parsedRows);
  } catch (err) {
    res.status(500).json({ error: 'Database query failed', message: err.message });
  }
});

// GET /api/stats — Dynamic dashboard analytics
router.get('/stats', async (req, res) => {
  try {
    const totalRow = await db.get('SELECT COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG"');
    const totalCount = totalRow ? totalRow.count : 0;

    const byYear = await db.all('SELECT year, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY year ORDER BY year ASC');
    const byCategory = await db.all('SELECT category, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY category ORDER BY count DESC');
    const byDeveloper = await db.all('SELECT developer, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY developer ORDER BY count DESC LIMIT 20');
    const bySeverity = await db.all('SELECT severity, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY severity ORDER BY severity ASC');
    
    const affectedRow = await db.get('SELECT affected_group, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" AND affected_group IS NOT NULL AND affected_group != "" GROUP BY affected_group ORDER BY count DESC LIMIT 1');
    const peakYearRow = await db.get('SELECT year, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY year ORDER BY count DESC LIMIT 1');

    res.json({
      totalCount,
      mostAffectedGroup: affectedRow ? affectedRow.affected_group : 'General Public',
      peakYear: peakYearRow ? peakYearRow.year : 2024,
      byYear,
      byCategory,
      byDeveloper,
      bySeverity
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute stats', message: err.message });
  }
});

// GET /api/developers — List unique developers
router.get('/developers', async (req, res) => {
  try {
    const rows = await db.all('SELECT DISTINCT developer FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" AND developer IS NOT NULL AND developer != "" ORDER BY developer ASC');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(rows.map(r => r.developer));
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve developers', message: err.message });
  }
});

// GET /api/categories — Categories and counts
router.get('/categories', async (req, res) => {
  try {
    const rows = await db.all('SELECT category, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY category ORDER BY count DESC');
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve categories', message: err.message });
  }
});

// GET /api/incidents/:id — Single incident
router.get('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM incidents WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    try {
      row.tags = JSON.parse(row.tags || '[]');
    } catch (err) {
      row.tags = [];
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: 'Database fetch failed', message: err.message });
  }
});

// POST /api/incidents — Manual insert
router.post('/', async (req, res) => {
  const {
    title, description, system_name, developer, category, subcategory,
    year, month, severity, affected_group, geography, source_url, tags
  } = req.body;

  if (!title || !category || !year) {
    return res.status(400).json({ error: 'Missing required fields (title, category, year)' });
  }

  try {
    const result = await db.run(`
      INSERT INTO incidents (
        title, description, system_name, developer, category, subcategory,
        year, month, severity, affected_group, geography, source_url,
        tags, external_id, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      description || '',
      system_name || 'Manual Entry',
      developer || 'Unknown Developer',
      category,
      subcategory || category,
      parseInt(year, 10),
      month ? parseInt(month, 10) : 1,
      severity ? parseInt(severity, 10) : 1,
      affected_group || 'General Public',
      geography || 'Global',
      source_url || '',
      formatTags(tags),
      `manual-${Date.now()}`,
      'manual'
    ]);

    res.status(201).json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: 'Failed to insert incident', message: err.message });
  }
});

// PUT /api/incidents/:id — Update existing manual/scraped incident
router.put('/:id', async (req, res) => {
  const {
    title, description, system_name, developer, category, subcategory,
    year, month, severity, affected_group, geography, source_url, tags
  } = req.body;

  try {
    const exists = await db.get('SELECT id FROM incidents WHERE id = ?', [req.params.id]);
    if (!exists) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    await db.run(`
      UPDATE incidents
      SET title = ?, description = ?, system_name = ?, developer = ?, category = ?, subcategory = ?,
          year = ?, month = ?, severity = ?, affected_group = ?, geography = ?, source_url = ?,
          tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title,
      description || '',
      system_name || 'AI System',
      developer || 'Unknown Developer',
      category,
      subcategory || category,
      parseInt(year, 10),
      month ? parseInt(month, 10) : 1,
      severity ? parseInt(severity, 10) : 1,
      affected_group || 'General Public',
      geography || 'Global',
      source_url || '',
      formatTags(tags),
      req.params.id
    ]);

    res.json({ success: true, message: 'Incident updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update incident', message: err.message });
  }
});

module.exports = router;
