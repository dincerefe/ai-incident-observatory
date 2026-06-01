const { classifyIncident, estimateSeverity } = require('./aiid');

// Custom regex-based compiled YAML parser
function parseAtlasBlock(blockText, id) {
  const obj = { id };

  // 1. Extract name
  const nameMatch = blockText.match(/name:\s*(['"]?)(.*?)\1\s*$/m) || blockText.match(/name:\s*([^\n]+)/);
  if (nameMatch) {
    obj.name = nameMatch[2] ? nameMatch[2].trim() : nameMatch[1].trim();
    obj.name = obj.name.replace(/^['"]|['"]$/g, ''); // strip outer quotes
  }

  // 2. Extract date
  const dateMatch = blockText.match(/incident-date:\s*([\d-]+)/);
  if (dateMatch) {
    obj.date = dateMatch[1].trim();
  }

  // 3. Extract target
  const targetMatch = blockText.match(/target:\s*(['"]?)(.*?)\1\s*$/m) || blockText.match(/target:\s*([^\n]+)/);
  if (targetMatch) {
    obj.target = targetMatch[2] ? targetMatch[2].trim() : targetMatch[1].trim();
    obj.target = obj.target.replace(/^['"]|['"]$/g, '');
  }

  // 4. Extract actor
  const actorMatch = blockText.match(/actor:\s*(['"]?)(.*?)\1\s*$/m) || blockText.match(/actor:\s*([^\n]+)/);
  if (actorMatch) {
    obj.actor = actorMatch[2] ? actorMatch[2].trim() : actorMatch[1].trim();
    obj.actor = obj.actor.replace(/^['"]|['"]$/g, '');
  }

  // 5. Extract summary (handling single/double quotes and multi-line YAML folding blocks)
  const summaryMatch = blockText.match(/summary:\s*(['"])([\s\S]*?)\1/);
  if (summaryMatch) {
    obj.summary = summaryMatch[2].replace(/\n\s+/g, ' ').trim();
  } else {
    const blockSummaryMatch = blockText.match(/summary:\s*\|?\s*\n(\s+[\s\S]*?)(?=\n\S|$)/);
    if (blockSummaryMatch) {
      obj.summary = blockSummaryMatch[1].replace(/\n\s+/g, ' ').trim();
    } else {
      const simpleSummaryMatch = blockText.match(/summary:\s*([^\n]+)/);
      if (simpleSummaryMatch) {
        obj.summary = simpleSummaryMatch[1].trim();
      }
    }
  }

  return obj;
}

async function fetchATLASIncidents() {
  console.log('Starting MITRE ATLAS case studies scraper...');
  const url = 'https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`MITRE ATLAS YAML returned HTTP ${res.status}`);
    }

    const yamlText = await res.text();
    const parts = yamlText.split('case-studies:');
    
    if (parts.length < 2) {
      console.warn('Could not find case-studies block in ATLAS compiled YAML.');
      return [];
    }

    // Split block into individual case study segments
    // In YAML, each case study item starts with "\n- id: AML.CSxxxx"
    const caseBlocks = parts[1].split('\n- id: ');
    
    // The first item might be empty or a newline before the first "- id: "
    if (caseBlocks[0] && !caseBlocks[0].includes('id:')) {
      caseBlocks.shift();
    }

    console.log(`Parsed ${caseBlocks.length} case study blocks from ATLAS compiled YAML.`);

    const formattedIncidents = [];

    for (const block of caseBlocks) {
      // Find the ID at the very start of the block
      const idMatch = block.match(/^(AML\.CS\d+)/);
      if (!idMatch) continue;

      const id = idMatch[1];
      const caseData = parseAtlasBlock(block, id);

      const title = caseData.name || `MITRE ATLAS Case Study ${id}`;
      const description = caseData.summary || `MITRE ATLAS adversarial threat report targeting ${caseData.target || 'AI System'}.`;
      const system_name = caseData.target || 'Target System';
      const developer = caseData.actor || 'Unknown Actor';

      // Parse Date
      let year = 2024;
      let month = 1;
      if (caseData.date) {
        const dateParts = caseData.date.split('-');
        if (dateParts[0]) year = parseInt(dateParts[0], 10);
        if (dateParts[1]) month = parseInt(dateParts[1], 10);
      }

      // Estimate category and severity
      const category = classifyIncident(title, description);
      const severity = estimateSeverity(title, description);

      // Create stable external ID
      const external_id = `atlas-${id.toLowerCase()}`;

      // Assemble tags
      const tagsList = ['scraped', 'atlas', 'security-threat', id.toLowerCase()];
      if (caseData.target) {
        tagsList.push(caseData.target.toLowerCase().replace(/[^a-z0-9]/g, '-'));
      }
      const cleanTags = Array.from(new Set(tagsList.filter(Boolean))).slice(0, 10);

      formattedIncidents.push({
        title,
        description: description.substring(0, 1000),
        system_name: system_name.substring(0, 100),
        developer: developer.substring(0, 100),
        category,
        subcategory: `adversarial-attack`,
        year,
        month,
        severity,
        affected_group: 'Security & ML Operators',
        geography: 'Global',
        source_url: `https://atlas.mitre.org/studies/${id}`,
        tags: JSON.stringify(cleanTags),
        external_id,
        source: 'atlas'
      });
    }

    console.log(`Successfully formatted ${formattedIncidents.length} technical MITRE ATLAS case studies!`);
    return formattedIncidents;

  } catch (err) {
    console.error('Error in MITRE ATLAS scraper:', err.message);
    return [];
  }
}

module.exports = {
  fetchATLASIncidents
};
