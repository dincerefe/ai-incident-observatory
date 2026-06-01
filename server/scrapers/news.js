const { classifyIncident, estimateSeverity } = require('./aiid');

// Helper to decode basic XML/HTML entities
function decodeXml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1') // CDATA unwrap
    .trim();
}

// Simple deterministic hash function for generating stable unique external IDs from links
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

async function fetchNewsIncidents() {
  console.log('Starting Google News RSS scraper...');
  
  const query = 'AI incident OR AI accident OR AI bias OR AI leak OR robot crash';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Google News RSS returned HTTP ${res.status}`);
    }

    const xml = await res.text();
    const rawItems = xml.split('<item>');
    rawItems.shift(); // Remove XML header metadata

    console.log(`Parsed ${rawItems.length} raw RSS news items from Google News feed.`);

    const formattedIncidents = [];

    for (const item of rawItems) {
      // Extract title, link, pubDate, description
      const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const descMatch = item.match(/<description>([\s\S]*?)<\/description>/);

      if (!titleMatch || !linkMatch) continue;

      const rawTitle = decodeXml(titleMatch[1]);
      const sourceUrl = decodeXml(linkMatch[1]);
      const rawDesc = descMatch ? decodeXml(descMatch[1].replace(/<[^>]*>/g, '')) : ''; // strip html tags
      const pubDateStr = pubDateMatch ? decodeXml(pubDateMatch[1]) : '';

      // Google News titles are usually in the format: "Headline Headline - News Source"
      let headline = rawTitle;
      let publisher = 'General News';
      
      const splitIdx = rawTitle.lastIndexOf(' - ');
      if (splitIdx !== -1) {
        headline = rawTitle.substring(0, splitIdx).trim();
        publisher = rawTitle.substring(splitIdx + 3).trim();
      }

      // Parse pubDate to get Year and Month
      let year = 2026;
      let month = 5;
      if (pubDateStr) {
        const dateObj = new Date(pubDateStr);
        if (!isNaN(dateObj.getTime())) {
          year = dateObj.getFullYear();
          month = dateObj.getMonth() + 1; // 1-indexed
        }
      }

      // Use helper to classify and score severity
      const category = classifyIncident(headline, rawDesc);
      const severity = estimateSeverity(headline, rawDesc);

      // Create structured description
      const description = rawDesc || `Recent report from ${publisher} covering: "${headline}". Refer to the source article for full investigation details.`;

      // Simple tags extraction
      const tagsList = ['scraped', 'news', publisher.toLowerCase().replace(/[^a-z0-9]/g, '-')];
      const cleanTags = Array.from(new Set(tagsList.filter(Boolean))).slice(0, 10);

      // Create stable external ID based on link hash
      const external_id = `news-${hashString(sourceUrl)}`;

      formattedIncidents.push({
        title: headline.length > 150 ? headline.substring(0, 147) + '...' : headline,
        description: description.substring(0, 1000), // safe boundary
        system_name: `${publisher} Article`,
        developer: publisher,
        category,
        subcategory: `${category.toLowerCase().replace(/\s*&\s*/g, '-')}-news`,
        year,
        month,
        severity,
        affected_group: 'General Public',
        geography: 'Global',
        source_url: sourceUrl.substring(0, 255),
        tags: JSON.stringify(cleanTags),
        external_id,
        source: 'news'
      });
    }

    console.log(`Successfully formatted ${formattedIncidents.length} real-world news alert incidents!`);
    return formattedIncidents;

  } catch (err) {
    console.error('Error in Google News RSS Scraper:', err.message);
    return [];
  }
}

module.exports = {
  fetchNewsIncidents
};
