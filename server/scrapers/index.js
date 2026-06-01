const db = require('../db');
const { fetchAIIDIncidents } = require('./aiid');
const { fetchAIAAICIncidents } = require('./aiaaic');
const { fetchNewsIncidents } = require('./news');
const { fetchAVIDIncidents } = require('./avid');
const { fetchATLASIncidents } = require('./atlas');

// Levenshtein distance calculation
function levenshtein(a, b) {
  const matrix = [];
  const alen = a.length;
  const blen = b.length;

  if (alen === 0) return blen;
  if (blen === 0) return alen;

  for (let i = 0; i <= alen; i++) matrix[i] = [i];
  for (let j = 0; j <= blen; j++) matrix[0][j] = j;

  for (let i = 1; i <= alen; i++) {
    for (let j = 1; j <= blen; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }

  return matrix[alen][blen];
}

// Normalize title for accurate fuzzy matching
function normalizeTitle(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .replace(/\s+/g, ' ')    // collapse whitespace
    .trim();
}

// Calculate normalized Levenshtein distance (0.0 to 1.0)
function getFuzzyDistance(titleA, titleB) {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);

  if (normA === normB) return 0;
  if (normA.length === 0 || normB.length === 0) return 1;

  const dist = levenshtein(normA, normB);
  return dist / Math.max(normA.length, normB.length);
}

// Main sync orchestrator
async function syncAll() {
  console.log('Initiating AI Incident Observatory data synchronization...');
  
  const stats = {
    added: 0,
    skipped: 0,
    errors: []
  };

  try {
    // 1. Fetch existing incidents from database
    const existingList = await db.all('SELECT id, title, external_id FROM incidents');
    console.log(`Loaded ${existingList.length} existing incidents from database for deduplication.`);

    // Keep an in-memory list to prevent duplicates within the same batch
    const inMemoryExisting = [...existingList];

    // Helper to check for duplicates in DB or current batch
    function findDuplicate(item) {
      // Check external_id match
      if (item.external_id) {
        const idMatch = inMemoryExisting.find(ex => ex.external_id === item.external_id);
        if (idMatch) return { type: 'external_id', match: idMatch };
      }

      // Check fuzzy title match (Levenshtein < 0.15)
      for (const ex of inMemoryExisting) {
        const dist = getFuzzyDistance(item.title, ex.title);
        if (dist < 0.15) {
          return { type: 'fuzzy_title', match: ex, distance: dist.toFixed(3) };
        }
      }

      return null;
    }

    // 2. Clear old synthetic data permanently before we load all real-world databases
    console.log("Purging all previous programmatic synthetic data (source = 'scraped')...");
    await db.exec("DELETE FROM incidents WHERE source = 'scraped'");

    // 3. Fetch and run all 5 real-world scrapers
    let scrapedItems = [];

    // Run AIID Scraper
    try {
      const aiidItems = await fetchAIIDIncidents();
      scrapedItems = scrapedItems.concat(aiidItems);
    } catch (err) {
      console.error('AIID scraping failed:', err.message);
      stats.errors.push(`AIID scraper error: ${err.message}`);
    }

    // Run AIAAIC Scraper
    try {
      const aiaaicItems = await fetchAIAAICIncidents();
      scrapedItems = scrapedItems.concat(aiaaicItems);
    } catch (err) {
      console.error('AIAAIC scraping failed:', err.message);
      stats.errors.push(`AIAAIC scraper error: ${err.message}`);
    }

    // Run Google News RSS Scraper
    try {
      const newsItems = await fetchNewsIncidents();
      scrapedItems = scrapedItems.concat(newsItems);
    } catch (err) {
      console.error('Google News RSS scraping failed:', err.message);
      stats.errors.push(`Google News RSS scraper error: ${err.message}`);
    }

    // Run AVID Scraper
    try {
      const avidItems = await fetchAVIDIncidents();
      scrapedItems = scrapedItems.concat(avidItems);
    } catch (err) {
      console.error('AVID scraping failed:', err.message);
      stats.errors.push(`AVID scraper error: ${err.message}`);
    }

    // Run MITRE ATLAS Scraper
    try {
      const atlasItems = await fetchATLASIncidents();
      scrapedItems = scrapedItems.concat(atlasItems);
    } catch (err) {
      console.error('MITRE ATLAS scraping failed:', err.message);
      stats.errors.push(`MITRE ATLAS scraper error: ${err.message}`);
    }

    console.log(`Scraping finished. Processing ${scrapedItems.length} total real scraped records...`);

    // 3. Process records with transaction
    await db.exec('BEGIN TRANSACTION');

    for (const item of scrapedItems) {
      const duplicate = findDuplicate(item);
      if (duplicate) {
        // Log skipped duplicate details
        if (duplicate.type === 'external_id') {
          console.log(`[DUPLICATE] Skipped "${item.title}" (Exact External ID match: ${item.external_id})`);
        } else {
          console.log(`[DUPLICATE] Skipped "${item.title}" (Fuzzy title match with "${duplicate.match.title}" - Dist: ${duplicate.distance})`);
        }
        stats.skipped++;
        continue;
      }

      // Insert new incident
      const result = await db.run(`
        INSERT INTO incidents (
          title, description, system_name, developer, category, subcategory, 
          year, month, severity, affected_group, geography, source_url, 
          tags, external_id, source
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `, [
        item.title,
        item.description,
        item.system_name,
        item.developer,
        item.category,
        item.subcategory,
        item.year,
        item.month,
        item.severity,
        item.affected_group,
        item.geography,
        item.source_url,
        item.tags,
        item.external_id,
        item.source
      ]);

      // Add to in-memory check list
      inMemoryExisting.push({
        id: result.lastID,
        title: item.title,
        external_id: item.external_id
      });
      stats.added++;
    }

    await db.exec('COMMIT');
    console.log('Synchronization complete!');
    console.log(`- Added: ${stats.added} new incidents`);
    console.log(`- Skipped (duplicates): ${stats.skipped} incidents`);
    if (stats.errors.length > 0) {
      console.log(`- Scraper warnings:`, stats.errors);
    }

    // Save sync status to database metadata log (optional, or we can track it globally)
    await db.run('INSERT INTO incidents (title, description, source, year) VALUES (?, ?, ?, ?)', [
      'OBSERVATORY_SYNC_LOG',
      JSON.stringify({ timestamp: new Date().toISOString(), ...stats }),
      'scraped',
      9999 // Special year for metadata logs
    ]);

  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (e) {
      console.error('Rollback failed:', e.message);
    }
    console.error('Sync orchestrator failed:', err.message);
    stats.errors.push(`Orchestrator transaction error: ${err.message}`);
  }

  return stats;
}

module.exports = {
  syncAll,
  levenshtein,
  getFuzzyDistance,
  normalizeTitle
};
