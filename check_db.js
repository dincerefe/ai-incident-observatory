const db = require('./server/db');

async function checkYears() {
  try {
    const rows = await db.all('SELECT year, COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" GROUP BY year ORDER BY year ASC');
    console.log('Incident counts by year in database:');
    console.log(rows);
    
    const sample = await db.all('SELECT title, year, source FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG" LIMIT 10');
    console.log('\nSample incidents:');
    console.log(sample);
  } catch (err) {
    console.error('Error querying database:', err.message);
  } finally {
    await db.close();
  }
}

setTimeout(checkYears, 500);
