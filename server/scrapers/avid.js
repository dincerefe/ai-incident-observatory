const { classifyIncident, estimateSeverity } = require('./aiid');

// Controlled concurrency batch fetcher
async function fetchWithConcurrency(urls, concurrencyLimit) {
  const results = [];
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < urls.length) {
      const index = currentIndex++;
      const url = urls[index];
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (res.ok) {
          const json = await res.json();
          results.push({ json, url });
        }
      } catch (err) {
        // Silently catch single fetch errors
      }
    }
  }

  const workers = Array(Math.min(concurrencyLimit, urls.length)).fill(null).map(worker);
  await Promise.all(workers);
  return results;
}

async function fetchAVIDIncidents() {
  console.log('Starting AVID GitHub scraper...');
  const treeUrl = 'https://api.github.com/repos/avidml/avid-db/git/trees/main?recursive=1';
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const res = await fetch(treeUrl, { headers });
    if (!res.ok) {
      throw new Error(`AVID Git Tree returned HTTP ${res.status}`);
    }

    const treeJson = await res.ok ? await res.json() : { tree: [] };
    const rawPaths = (treeJson.tree || [])
      .filter(t => t.path.startsWith('reports/') && t.path.endsWith('.json'))
      .map(t => t.path);

    console.log(`Found ${rawPaths.length} total vulnerability reports in AVID repository.`);

    // Sort descending to get the newest reports first (e.g. 2026/2025/2024)
    rawPaths.sort((a, b) => b.localeCompare(a));

    // Limit to the most recent 350 reports to stay fast and rate-limit safe
    const targetPaths = rawPaths.slice(0, 350);
    const rawUrls = targetPaths.map(p => `https://raw.githubusercontent.com/avidml/avid-db/main/${p}`);

    console.log(`Fetching ${targetPaths.length} of the newest AVID JSON files concurrently (limit 30)...`);
    const fetchedResults = await fetchWithConcurrency(rawUrls, 30);
    console.log(`Successfully downloaded ${fetchedResults.length} raw AVID JSON reports.`);

    const formattedIncidents = [];

    for (const item of fetchedResults) {
      const report = item.json;
      const fileUrl = item.url;

      if (!report.metadata || !report.metadata.report_id) continue;

      const external_id = report.metadata.report_id;

      // Extract title and description
      const descValue = report.description && report.description.value ? report.description.value.trim() : '';
      const probValue = report.problemtype && report.problemtype.description && report.problemtype.description.value 
        ? report.problemtype.description.value.trim() 
        : '';
      
      let title = probValue || descValue || 'AI Vulnerability Disclosure';
      if (title.length > 150) {
        title = title.substring(0, 147) + '...';
      }

      // Extract system name
      let system_name = 'General Model';
      if (report.affects && report.affects.artifacts && report.affects.artifacts.length > 0) {
        const art = report.affects.artifacts[0];
        if (art && art.name) system_name = art.name;
      }

      // Extract developer or deployer
      let developer = 'Industry';
      if (report.affects) {
        if (report.affects.developer && report.affects.developer.length > 0) {
          developer = report.affects.developer.join('; ');
        } else if (report.affects.deployer && report.affects.deployer.length > 0) {
          developer = report.affects.deployer.join('; ');
        }
      }

      // Extract date details
      let year = 2024;
      let month = 1;
      const reportedDate = report.reported_date;
      if (reportedDate) {
        const parts = reportedDate.split('-');
        if (parts[0]) year = parseInt(parts[0], 10);
        if (parts[1]) month = parseInt(parts[1], 10);
      }

      // Extract source URL (reference)
      let source_url = `https://github.com/avidml/avid-db/blob/main/${targetPaths[fetchedResults.indexOf(item)] || ''}`;
      if (report.references && report.references.length > 0 && report.references[0].url) {
        source_url = report.references[0].url;
      }

      // Synthesize full description
      let fullDescription = descValue || title;
      if (report.problemtype && report.problemtype.classof) {
        fullDescription += ` Classification: ${report.problemtype.classof}.`;
      }
      if (report.impact && report.impact.avid && report.impact.avid.vuln_id) {
        fullDescription += ` Associated Vulnerability ID: ${report.impact.avid.vuln_id}.`;
      }

      // Estimate category and severity
      const category = classifyIncident(title, fullDescription);
      const severity = estimateSeverity(title, fullDescription);

      // Gather tags
      const tagsList = ['scraped', 'avid', 'vulnerability'];
      if (report.problemtype && report.problemtype.classof) {
        tagsList.push(report.problemtype.classof.toLowerCase().replace(/\s+/g, '-'));
      }
      if (developer && developer !== 'Industry') {
        tagsList.push(developer.toLowerCase().split(';')[0].trim().replace(/\s+/g, '-'));
      }
      const cleanTags = Array.from(new Set(tagsList.filter(Boolean))).slice(0, 10);

      formattedIncidents.push({
        title,
        description: fullDescription.substring(0, 1000),
        system_name: system_name.substring(0, 100),
        developer: developer.substring(0, 100),
        category,
        subcategory: report.problemtype && report.problemtype.type ? report.problemtype.type.substring(0, 50) : `${category}-vulnerability`,
        year,
        month,
        severity,
        affected_group: 'AI Users & Developers',
        geography: 'Global',
        source_url: source_url.substring(0, 255),
        tags: JSON.stringify(cleanTags),
        external_id,
        source: 'avid'
      });
    }

    console.log(`Successfully formatted ${formattedIncidents.length} structured AVID vulnerabilities!`);
    return formattedIncidents;

  } catch (err) {
    console.error('Error in AVID scraper:', err.message);
    return [];
  }
}

module.exports = {
  fetchAVIDIncidents
};
