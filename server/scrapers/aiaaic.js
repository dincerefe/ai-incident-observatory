const dotenv = require('dotenv');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { classifyIncident, estimateSeverity } = require('./aiid');

// Load environment variables if not loaded
dotenv.config({ path: path.join(__dirname, '../../.env') });

const AIAAIC_CSV_URL = process.env.AIAAIC_CSV_URL || 'https://docs.google.com/spreadsheets/d/1Bn55B4xz21-_Rgdr8BBb2lt0n_4rzLGxFADMlVW0PYI/export?format=csv&gid=888071280';

async function fetchAIAAICIncidents() {
  console.log('Starting AIAAIC CSV scraper...');
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const res = await fetch(AIAAIC_CSV_URL, { headers });
    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
    }

    const csvText = await res.text();
    console.log(`Retrieved AIAAIC CSV text. Size: ${csvText.length} bytes.`);

    // Parse CSV rows
    const rows = parse(csvText, {
      skip_empty_lines: true
    });

    console.log(`Parsed ${rows.length} total rows from AIAAIC sheet.`);
    
    // In AIAAIC sheet:
    // Row 0: "Incidents" (cover title)
    // Row 1: Headers ("AIAAIC ID#", "Headline", "Occurred", "Deployer", "Developer", "System name", "Technology", "Purpose", ...)
    // Row 2: Sub-headers ("Jurisdiction", "Sector", "Individual", "Societal", "Environmental")
    // Actual data starts at Row 3
    
    if (rows.length < 4) {
      console.log('Too few rows found in AIAAIC CSV, skipping.');
      return [];
    }

    const formattedIncidents = [];

    // Start parsing from index 3
    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip empty or malformed rows (needs at least ID and Headline)
      if (!row[0] || !row[1] || row[0].trim() === '' || row[1].trim() === '') {
        continue;
      }

      const external_id = `aiaaic-${row[0].trim()}`;
      const title = row[1].trim();

      // Extract Year and Month from "Occurred" column (index 2)
      let year = 2024;
      let month = 1;
      const occurred = row[2] ? row[2].trim() : '';
      if (occurred) {
        // Occurred can be "2025" or a date. Let's extract digits.
        const matchYear = occurred.match(/\b(20\d{2}|19\d{2})\b/);
        if (matchYear) {
          year = parseInt(matchYear[1], 10);
        }
      }

      const deployer = row[3] ? row[3].trim() : '';
      const developerRaw = row[4] ? row[4].trim() : '';
      const system_nameRaw = row[5] ? row[5].trim() : '';
      const technology = row[6] ? row[6].trim() : '';
      const purpose = row[7] ? row[7].trim() : '';
      const ethicalIssue = row[9] ? row[9].trim() : '';
      const geography = row[10] ? row[10].trim() : 'Global';
      const sector = row[11] ? row[11].trim() : 'General';
      const individualImpact = row[12] ? row[12].trim() : '';
      const societalImpact = row[13] ? row[13].trim() : '';
      const consequence = row[15] ? row[15].trim() : '';
      const summaryLink = row[17] ? row[17].trim() : '';

      // Standardize Developer
      const developer = developerRaw || deployer || 'Industry';
      // Standardize System Name
      const system_name = system_nameRaw || technology || 'AI System';

      // Synthesize full description based on CSV fields
      let description = `Headline: ${title}. `;
      if (sector) description += `Sector impacted: ${sector}. `;
      if (technology) description += `Technology deployed: ${technology}. `;
      if (ethicalIssue) description += `Ethical concerns raised: ${ethicalIssue}. `;
      if (societalImpact || individualImpact) {
        description += `Impact details: ${societalImpact || individualImpact}. `;
      }
      if (consequence) description += `Consequences: ${consequence}.`;

      // Classify category and severity
      const category = classifyIncident(title, description);
      const severity = estimateSeverity(title, description);

      // Parse tags
      const tagsList = ["scraped", "aiaaic"];
      if (technology) tagsList.push(...technology.toLowerCase().split(';').map(t => t.trim()));
      if (ethicalIssue) tagsList.push(...ethicalIssue.toLowerCase().split(';').map(e => e.trim()));
      
      // Filter out empty tags
      const cleanTags = Array.from(new Set(tagsList.filter(t => t && t.length > 0))).slice(0, 10);

      // Map links
      const source_url = summaryLink || `https://www.aiaaic.org/aiaaic-repository`;

      formattedIncidents.push({
        title: title.length > 150 ? title.substring(0, 147) + '...' : title,
        description,
        system_name: system_name.substring(0, 100),
        developer: developer.substring(0, 100),
        category,
        subcategory: technology ? technology.substring(0, 50) : category,
        year,
        month,
        severity,
        affected_group: sector ? sector.substring(0, 100) : 'General Public',
        geography: geography ? geography.substring(0, 100) : 'Global',
        source_url: source_url.substring(0, 255),
        tags: JSON.stringify(cleanTags),
        external_id,
        source: 'aiaaic'
      });
    }

    console.log(`Successfully formatted ${formattedIncidents.length} incidents from AIAAIC.`);
    return formattedIncidents;
  } catch (err) {
    console.error('Error in AIAAIC scraper:', err.message);
    return [];
  }
}

module.exports = {
  fetchAIAAICIncidents
};
