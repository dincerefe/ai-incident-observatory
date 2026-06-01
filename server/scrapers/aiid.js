const dotenv = require('dotenv');
const path = require('path');

// Load environment variables if not loaded
dotenv.config({ path: path.join(__dirname, '../../.env') });

const AIID_API_URL = process.env.AIID_API_URL || 'https://incidentdatabase.ai/api/graphql';

const CATEGORY_KEYWORDS = {
  "Bias & Discrimination": ["bias", "racist", "racial", "gender", "sex", "discrimination", "minority", "black", "female", "women", "prejudice", "stereotype", "diverse", "underrepresent"],
  "Misinformation & Hallucination": ["hallucinat", "fake", "deepfake", "misinform", "lie", "fabricated", "error", "false", "debunked", "untruth", "rumor", "advisor", "fact", "wrong"],
  "Privacy & Surveillance": ["privacy", "surveillance", "stalk", "tracking", "track", "face recognition", "facial recognition", "spy", "leak", "exfiltrat", "data breach", "expose", "mugshot"],
  "Physical Safety": ["crash", "kill", "death", "fatal", "collision", "accident", "safety", "injury", "physical", "bodily", "hit", "pedestrian", "near-miss", "plane", "car", "robot"],
  "Labor & Economy": ["labor", "job", "employee", "hiring", "recruit", "resume", "salary", "wage", "worker", "union", "displacement", "freelance", "unemployment", "grading", "grade"],
  "Copyright & IP": ["copyright", "ip", "trademark", "patent", "gpl", "clone", "license", "copying", "fair use", "lawsuit", "scrape", "author", "watermark", "cloning"],
  "Manipulation & Autonomy": ["manipulat", "threaten", "persuade", "addict", "screen time", "radicaliz", "influence", "dark pattern", "coordinate", "election", "voter", "robocall", "trolls"],
  "Agentic Failures": ["agentic", "agent", "auto-gpt", "devin", "unauthorized", "loop", "deletion", "execution", "recursive", "compile error", "action loop", "shell", "delete"],
  "Environmental": ["environment", "emission", "diesel", "climate", "water", "ecology", "carbon", "wildlife", "agriculture", "pollution", "farm", "crop"],
  "Criminal Justice": ["recidivism", "compas", "court", "judge", "arrest", "police", "jail", "prison", "sentence", "law enforcement", "welfare", "robodebt", "prosecutor"],
  "Healthcare": ["healthcare", "medical", "patient", "oncology", "tumor", "clinical", "doctor", "diagnosis", "misdiagnos", "therapy", "disease", "triage", "hospital", "cancer"],
  "Financial": ["financial", "trading", "bank", "credit", "loan", "stock", "market", "arbitrage", "crypto", "bitcoin", "loss", "cash", "pricing", "underwriting", "billing"]
};

// Auto-classifies an incident based on text scoring
function classifyIncident(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  
  let bestCategory = "Misinformation & Hallucination"; // fallback default
  let highestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      const regex = new RegExp(keyword, 'gi');
      const matches = text.match(regex);
      if (matches) {
        score += matches.length;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

// Estimates severity (1-3) based on keywords in description
function estimateSeverity(title = "", description = "") {
  const text = `${title} ${description}`.toLowerCase();
  const highSeverityWords = ["kill", "death", "fatal", "dead", "suicide", "crash", "collision", "arrest", "prison", "jail", "bankruptcy", "440 million", "100 billion", "displacement", "lawsuit", "sued"];
  const mediumSeverityWords = ["bias", "hallucination", "hallucinate", "leak", "privacy", "discrimination", "warning", "ban", "protest", "strike"];
  
  let score = 0;
  for (const w of highSeverityWords) {
    if (text.includes(w)) score += 3;
  }
  for (const w of mediumSeverityWords) {
    if (text.includes(w)) score += 1;
  }

  if (score >= 6) return 3;
  if (score >= 2) return 2;
  return 1;
}

const graphqlQuery = {
  query: `query {
    incidents(pagination: { limit: 800, skip: 0 }) {
      incident_id
      title
      description
      date
      AllegedDeployerOfAISystem {
        name
      }
      AllegedDeveloperOfAISystem {
        name
      }
      reports {
        url
        title
      }
    }
  }`
};

async function fetchAIIDIncidents() {
  console.log('Starting paginated AIID GraphQL scraper...');
  
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://incidentdatabase.ai',
    'Referer': 'https://incidentdatabase.ai/'
  };

  let allFormatted = [];
  const limit = 800;
  let skip = 0;

  // Query up to 5 pages (4000 incidents)
  for (let page = 0; page < 5; page++) {
    console.log(`Fetching AIID page ${page + 1} (skip: ${skip})...`);
    
    const graphqlQuery = {
      query: `query {
        incidents(pagination: { limit: ${limit}, skip: ${skip} }) {
          incident_id
          title
          description
          date
          AllegedDeployerOfAISystem {
            name
          }
          AllegedDeveloperOfAISystem {
            name
          }
          reports {
            url
            title
          }
        }
      }`
    };

    try {
      const res = await fetch(AIID_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(graphqlQuery)
      });

      if (!res.ok) {
        console.error(`Page ${page + 1} returned HTTP Error: ${res.status}`);
        break;
      }

      const json = await res.json();
      if (json.errors) {
        console.error(`Page ${page + 1} returned GraphQL Errors:`, json.errors);
        break;
      }

      const rawIncidents = json.data?.incidents || [];
      if (rawIncidents.length === 0) {
        console.log('No more incidents returned from AIID. Ending pagination loop.');
        break;
      }

      console.log(`Page ${page + 1} fetched ${rawIncidents.length} raw incidents.`);

      const pageFormatted = rawIncidents.map(inc => {
        // Extract date details
        let year = 2024;
        let month = 1;
        if (inc.date) {
          const parts = inc.date.split('-');
          if (parts[0]) year = parseInt(parts[0], 10);
          if (parts[1]) month = parseInt(parts[1], 10);
        }

        // Map developer & deployer (system) lists
        const developer = inc.AllegedDeveloperOfAISystem && inc.AllegedDeveloperOfAISystem.length > 0
          ? inc.AllegedDeveloperOfAISystem.map(d => d.name).join('; ')
          : 'Industry';

        const system_name = inc.AllegedDeployerOfAISystem && inc.AllegedDeployerOfAISystem.length > 0
          ? inc.AllegedDeployerOfAISystem.map(d => d.name).join('; ')
          : 'Unknown System';

        // Map source URL
        const source_url = inc.reports && inc.reports.length > 0 && inc.reports[0].url
          ? inc.reports[0].url
          : `https://incidentdatabase.ai/cite/${inc.incident_id}`;

        // Classify category and severity
        const category = classifyIncident(inc.title, inc.description);
        const severity = estimateSeverity(inc.title, inc.description);

        // Simple tags extraction based on matches
        const tagsList = ["scraped", "aiid"];
        for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
          if (category === cat) {
            tagsList.push(cat.toLowerCase().replace(/\s*&\s*/g, '-'));
          }
        }

        return {
          title: inc.title || 'Untitled Incident',
          description: inc.description || '',
          system_name,
          developer,
          category,
          subcategory: category, // copy main category for subcategory
          year,
          month,
          severity,
          affected_group: 'General Public',
          geography: 'Global',
          source_url,
          tags: JSON.stringify(tagsList),
          external_id: `aiid-${inc.incident_id}`,
          source: 'aiid'
        };
      });

      allFormatted = allFormatted.concat(pageFormatted);
      
      // Advance pagination cursor
      skip += limit;
      
      // If we got fewer items than the page limit, we reached the end
      if (rawIncidents.length < limit) {
        break;
      }

    } catch (err) {
      console.error(`Error fetching page ${page + 1}:`, err.message);
      break;
    }
  }

  console.log(`AIID paginated scraper complete. Formatted ${allFormatted.length} total incidents.`);
  return allFormatted;
}

module.exports = {
  fetchAIIDIncidents,
  classifyIncident,
  estimateSeverity
};
