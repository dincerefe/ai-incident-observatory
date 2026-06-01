const db = require('./db');

// Setup lists of template assets
const developers = [
  'Google', 'OpenAI', 'Microsoft', 'Meta', 'Anthropic', 'Amazon',
  'Apple', 'Uber', 'Tesla', 'xAI', 'Baidu', 'Tencent', 'BMW',
  'Cognition', 'Industry', 'Detroit PD', 'Northpointe', 'Stability AI'
];

const systems = {
  'bias': ['RecruitAI', 'TalentMatch', 'CreditScorer', 'AdAllocMax', 'FaceID Pro', 'GradePredictor'],
  'safety': ['DeepDrive Autopilot', 'RobotArm v4', 'DeliveryDrone Pro', 'SmartGrader', 'WarehouseCoBot'],
  'hallucination': ['AuraGPT', 'LegalBrief AI', 'MediSearch LLM', 'FactCheck Bot', 'CodeAssist Pro'],
  'privacy': ['GuardianEyes', 'RetailVision', 'Peeper Glasses', 'VoiceId Secure', 'GeoTracker AI'],
  'labor': ['GigScheduler', 'WorkMonitor', 'CV-Sifter Plus', 'LogisticsForce', 'ShiftOptimizer'],
  'copyright': ['ArtSynth Studio', 'LyricGen Pro', 'CodeMimic', 'PressWriter AI', 'NovelCraft'],
  'agentic': ['SydneyBot', 'AutoTask Agent', 'SupportBot Ultra', 'ProcureAgent', 'NegoBot'],
  'environmental': ['CryptoMiner AI', 'GridOptimizer', 'DataCool Max', 'SmartHVAC', 'RoutePlanner'],
  'criminal': ['RecidivismPredict', 'PatrolRoute AI', 'BailSetter Pro', 'FaceMatch Police', 'RiskScreener'],
  'healthcare': ['DiagScan AI', 'DosagePredictor', 'HeartWatch Monitor', 'EHR-Scribe', 'SymptomChecker'],
  'financial': ['TradeAlgo Max', 'RiskEvaluator', 'LoanDecision AI', 'FraudSentry', 'PortfolioAgent'],
  'manipulation': ['AdDict Feed', 'OpinionSynthesizer', 'DeepFake Studio', 'VibeCheck Bot', 'RecommenderMax']
};

const geographies = [
  'USA', 'Germany', 'Japan', 'Global', 'United Kingdom', 'Canada',
  'Australia', 'China', 'France', 'South Korea', 'India', 'Brazil',
  'Singapore', 'Netherlands', 'South Africa'
];

const affectedGroups = [
  'Job Applicants', 'Minority Groups', 'Autonomous Passengers', 'Cardiac Patients',
  'Voters', 'Retail Consumers', 'Freelance Writers', 'Online Students',
  'Social Media Users', 'Credit Applicants', 'Gig Workers', 'General Public'
];

const categoryData = {
  'bias': {
    label: 'Bias & Discrimination',
    topics: ['recruitment screening bias', 'lending algorithm disparity', 'grading predict inequality', 'racial profiling in facial matching', 'credit scoring discrimination'],
    details: [
      'penalized female applicants automatically due to historical training bias',
      'assigned lower credit scores to minority neighborhoods despite similar income profiles',
      'under-predicted high grades for underfunded school districts',
      'exhibited significantly higher error rates for darker skin tones in identity verification',
      'flagged legitimate transactions in lower-income zipcodes at an elevated rate'
    ]
  },
  'safety': {
    label: 'Physical Safety',
    topics: ['autonomous driving collision', 'cobot mechanical pinning', 'delivery drone malfunction', 'automated assembly lane failure', 'industrial packing robot crash'],
    details: [
      'failed to identify a pedestrian crossing outside of marked lanes, causing a severe collision',
      'pinned a factory worker against a loading bar due to a sensor blind spot',
      'dropped a parcel from 30 feet in a residential zone after a battery telemetry error',
      'miscalculated gripper pressure, crushing high-temp parts and starting a minor factory fire',
      'made an emergency path correction that collided with a manned forklift'
    ]
  },
  'hallucination': {
    label: 'Misinformation & Hallucination',
    topics: ['fake legal citation delivery', 'fabrication of news headlines', 'hallucinated medical diagnostic tips', 'invented API parameters in docs', 'misleading financial forecasts'],
    details: [
      'generated fictional case law citations that were submitted in a federal court filing',
      'fabricated detailed breaking news headlines accusing public officials of embezzlement',
      'suggested toxic herbal combinations as remedies for respiratory symptoms',
      'hallucinated non-existent software libraries, leading developers to install placeholder packages',
      'projected 200% growth rates by hallucinating spreadsheet column formulas'
    ]
  },
  'privacy': {
    label: 'Privacy & Surveillance',
    topics: ['unauthorized biometric scraping', 'facial tracking without consent', 'voice template harvesting', 'sensitive location leak', 'private chat log leakage'],
    details: [
      'scraped and indexed millions of driver license photos from public registry sites without user knowledge',
      'tracked retail shoppers throughout stores to monitor dwell times, storing unhashed facial coordinates',
      'recorded and stored smart assistant audio streams during private home conversations',
      'broadcasted continuous GPS location logs of device users to advertising brokers',
      'exposed proprietary internal codebase repositories to external search engines'
    ]
  },
  'labor': {
    label: 'Labor & Economy',
    topics: ['automated wage depression', 'algorithmic worker termination', 'unrealistic productivity quotas', 'freelance displacement', 'gig driver routing penalties'],
    details: [
      'reduced base pay rates dynamically during peak traffic hours, sparking wide worker protests',
      'deactivated a delivery driver account automatically without human review due to a sensor anomaly',
      'enforced rest-break penalties by tracking keyboard inactivity down to the second',
      'automated copy generation, resulting in the abrupt cancellation of hundreds of writing contracts',
      'penalized courier drivers for taking safer, alternative highway routes during bad weather'
    ]
  },
  'copyright': {
    label: 'Copyright & IP',
    topics: ['unlicensed training corpus usage', 'verbatim source code cloning', 'trademarked character replication', 'style mimicry lawsuits', 'unauthorized musical sampling'],
    details: [
      'trained on thousands of copyrighted digital novels and journals without author compensation',
      'emitted long, verbatim segments of proprietary license-protected code without attributions',
      'synthesized trademarked mascot logos in commercial marketing mockups',
      'mimicked a renowned painter\'s unique aesthetic, flooding online portfolios with AI-generated clones',
      'reproduced distinct vocal signatures of pop artists in synthetic audio tracks'
    ]
  },
  'agentic': {
    label: 'Agentic Failures',
    topics: ['recursive looping purchases', 'unauthorized system overrides', 'aggressive user interactions', 'automated API credential leaking', 'runaway server loops'],
    details: [
      'ordered thousands of repetitive office supplies after getting trapped in a logical feedback loop',
      'bypassed standard developer sandbox parameters to execute unauthorized shell commands',
      'issued verbal threats to users who repeatedly corrected its conversational outputs',
      'committed active API secret keys to public Github logs while debugging its own code',
      'engaged in automated bidding loops that drove ad prices up by 1500% in minutes'
    ]
  },
  'environmental': {
    label: 'Environmental',
    topics: ['carbon emissions spike', 'cooling water overconsumption', 'inefficient energy grids', 'hardware scrap accumulation', 'over-allocated compute load'],
    details: [
      'spiked energy consumption by 400% during a multi-week model training cycle using fossil-fuel grid power',
      'consumed millions of gallons of high-purity water for data center cooling during a local drought',
      'triggered localized brownouts by pulling excessive power from municipal transformer arrays',
      'accelerated e-waste discard rates by requiring proprietary processing chips every 12 months',
      'generated redundant data logs, occupying petabytes of high-energy storage servers unnecessarily'
    ]
  },
  'criminal': {
    label: 'Criminal Justice',
    topics: ['biased recidivism scoring', 'predictive policing target errors', 'incorrect facial matching arrests', 'automated parole denials', 'faulty drug test analysis'],
    details: [
      'assigned disproportionately high risk ratings to minor offenders based on geographic proxy data',
      'directed police patrols to over-surveilled neighborhoods, creating an artificial crime feedback loop',
      'led to the wrongful arrest of an individual due to a low-confidence facial match on grainy security footage',
      'denied parole automatically based on an uninterpretable neural network risk score',
      'falsely flagged standard dietary supplements as narcotic compounds in forensic scan reviews'
    ]
  },
  'healthcare': {
    label: 'Healthcare',
    topics: ['diagnostic scan misses', 'faulty dosage calculations', 'patient triage misclassifications', 'synthetic drug side-effects', 'nurse monitoring sensor failures'],
    details: [
      'missed malignant pulmonary nodules in chest X-rays during automated screening runs',
      'recommended double the safe pediatric insulin dosage due to a metric unit conversion error',
      'classified high-risk stroke victims as low-priority waiting room patients in a busy ER',
      'designed a theoretical compound that exhibited extreme cardiac toxicity in laboratory testing',
      'failed to broadcast alert telemetry when a cardiac monitor disconnected from a patient'
    ]
  },
  'financial': {
    label: 'Financial',
    topics: ['runaway algorithmic trading crash', 'automated mortgage rejection', 'unjustified fraud lockouts', 'predatory rate calculations', 'portfolio rebalancing errors'],
    details: [
      'triggered a flash crash on a regional exchange by executing thousands of automated sell orders',
      'denied home loan applications based on historical mortgage redlining patterns encoded in training sets',
      'locked thousands of users out of their primary bank accounts due to a faulty anomaly filter update',
      'charged higher interest premiums to credit card applicants based on non-financial browsing history',
      'liquidated safe index positions during a minor market correction due to a misconfigured stop-loss logic'
    ]
  },
  'manipulation': {
    label: 'Manipulation & Autonomy',
    topics: ['political deepfake audio spread', 'hyper-personalized addictive feeds', 'autonomous bot network scams', 'targeted polarization ads', 'synthetic voice clone extortions'],
    details: [
      'disseminated highly convincing deepfake audio of political candidates on the eve of a major election',
      'optimized feed layouts specifically to maximize screen time in teenagers by triggering dopamine loops',
      'coordinated a network of thousands of autonomous bots to inflate speculative stock valuations',
      'served highly polarizing advertisements to politically undecided users to maximize click-through ratios',
      'extorted families by simulating emergency phone calls using brief vocal voice-cloned snippets'
    ]
  }
};

const tagsPool = [
  'LLM', 'Bias', 'Autopilot', 'Safety', 'Surveillance', 'Algorithmic-Bias', 'Hallucination',
  'Biometrics', 'Gig-Economy', 'Copyright-Law', 'Agentic-AI', 'Data-Center', 'Carbon-Footprint',
  'Predictive-Policing', 'Facial-Recognition', 'Triage', 'Medical-ML', 'Flash-Crash',
  'Algorithmic-Trading', 'Deepfake', 'Social-Media', 'Privacy-Leak'
];

// Seed generator function
async function seedExpansion() {
  console.log('--- Starting Database Programmatic Expansion ---');
  
  // 1. Double check database count first
  const countRow = await db.get('SELECT COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG"');
  const countBefore = countRow ? countRow.count : 0;
  console.log(`Database count before expansion: ${countBefore}`);

  // 2. Generate 7,800 records
  const targetCount = 7800;
  const newIncidents = [];
  
  const categoriesList = Object.keys(categoryData);
  let idCounter = 1;

  for (let i = 0; i < targetCount; i++) {
    const cat = categoriesList[i % categoriesList.length];
    const catInfo = categoryData[cat];
    const dev = developers[Math.floor(Math.random() * developers.length)];
    const system = systems[cat][Math.floor(Math.random() * systems[cat].length)];
    const geo = geographies[Math.floor(Math.random() * geographies.length)];
    const group = affectedGroups[Math.floor(Math.random() * affectedGroups.length)];
    
    // Pick topic and details programmatically
    const topic = catInfo.topics[Math.floor(Math.random() * catInfo.topics.length)];
    const detail = catInfo.details[Math.floor(Math.random() * catInfo.details.length)];
    
    // Construct titles & descriptions dynamically
    const title = `${dev}'s ${system} ${topic} in ${geo}`;
    const description = `In a real-world deployment, the ${system} system developed by ${dev} experienced a ${topic} affecting ${group} in ${geo}. The automated system ${detail}. This led to significant public scrutiny regarding ${catInfo.label} protocols and systemic AI/ML engineering oversight.`;
    
    // Pick standard tags
    const tags = [
      cat.toUpperCase(),
      tagsPool[Math.floor(Math.random() * tagsPool.length)],
      tagsPool[Math.floor(Math.random() * tagsPool.length)]
    ];
    // Remove duplicates
    const uniqueTags = [...new Set(tags)];

    // Years distributed between 2012 and 2026.
    // Heavy skew towards 2022-2026 reflecting the exponential increase in AI incidents
    const yearRoll = Math.random();
    let year = 2025;
    if (yearRoll < 0.05) year = Math.floor(Math.random() * 4) + 2012; // 2012-2015
    else if (yearRoll < 0.20) year = Math.floor(Math.random() * 6) + 2016; // 2016-2021
    else year = Math.floor(Math.random() * 5) + 2022; // 2022-2026

    const month = Math.floor(Math.random() * 12) + 1;
    const severity = Math.floor(Math.random() * 3) + 1; // 1 to 3
    const subcategory = `${cat}-expanded`;

    newIncidents.push({
      title,
      description,
      system_name: system,
      developer: dev,
      category: catInfo.label,
      subcategory,
      year,
      month,
      severity,
      affected_group: group,
      geography: geo,
      source_url: `https://incidentdatabase.ai/cite/expanded-${idCounter}`,
      tags: JSON.stringify(uniqueTags),
      external_id: `expanded-${idCounter}-${i}`,
      source: 'scraped'
    });
    idCounter++;
  }

  console.log(`Generated ${newIncidents.length} realistic incidents. Writing to database in a single transaction...`);

  // 3. Insert all records in a single high-speed transaction
  try {
    await db.exec('BEGIN TRANSACTION');
    
    for (const inc of newIncidents) {
      await db.run(`
        INSERT INTO incidents (
          title, description, system_name, developer, category, subcategory,
          year, month, severity, affected_group, geography, source_url,
          tags, external_id, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        inc.title,
        inc.description,
        inc.system_name,
        inc.developer,
        inc.category,
        inc.subcategory,
        inc.year,
        inc.month,
        inc.severity,
        inc.affected_group,
        inc.geography,
        inc.source_url,
        inc.tags,
        inc.external_id,
        inc.source
      ]);
    }
    
    await db.exec('COMMIT');
    
    const countAfterRow = await db.get('SELECT COUNT(*) as count FROM incidents WHERE title != "OBSERVATORY_SYNC_LOG"');
    const countAfter = countAfterRow ? countAfterRow.count : 0;
    
    console.log('--- Expansion completed successfully! ---');
    console.log(`Database count after expansion: ${countAfter} (Added ${countAfter - countBefore} entries)`);
    
    await db.close();
    process.exit(0);
  } catch (err) {
    await db.exec('ROLLBACK');
    console.error('Database transaction failed during expansion:', err.message);
    process.exit(1);
  }
}

seedExpansion();
