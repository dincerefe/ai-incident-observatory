const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Paths
const questionsPath = path.join(__dirname, 'ethical_questions.csv');
const csvPath = path.join(__dirname, 'ai_answers.csv');
const folderPath = path.join(__dirname, 'ai_answers');

// 1. Read existing CSV so we don't lose the original 5 models
console.log('Reading existing ai_answers.csv...');
const existingCSV = fs.readFileSync(csvPath, 'utf-8');
const existingRows = parse(existingCSV, { columns: true, skip_empty_lines: true, trim: true });

// We keep existing rows in a map of key -> list of rows to avoid duplicates if any model matches
const rowsByModel = {};
for (const row of existingRows) {
  const key = `${row.ai_name}|||${row.model_version}`;
  if (!rowsByModel[key]) {
    rowsByModel[key] = [];
  }
  rowsByModel[key].push(row);
}
console.log(`Loaded ${existingRows.length} existing rows across ${Object.keys(rowsByModel).length} profiles.`);

// 2. Load ethical questions to get their types
console.log('Reading ethical_questions.csv...');
const questionsCSV = fs.readFileSync(questionsPath, 'utf-8');
const questions = parse(questionsCSV, { columns: true, skip_empty_lines: true, trim: true });
const questionTypes = {};
for (const q of questions) {
  questionTypes[parseInt(q.id)] = q.question_type;
}
console.log(`Loaded ${questions.length} questions.`);

// Brand metadata config mapping
const BRAND_CONFIGS = [
  { prefix: 'claude', name: 'Claude', color: '#d97706', desc: 'Anthropic constitutional AI - trained to be helpful, harmless, and deeply honest.' },
  { prefix: 'gpt', name: 'ChatGPT', color: '#10a37f', desc: 'OpenAI flagship model - helpful, harmless, and honest by design.' },
  { prefix: 'gemini', name: 'Gemini', color: '#4285f4', desc: 'Google DeepMind multimodal AI - optimized for reasoning, safety, and helpfulness.' },
  { prefix: 'gemma', name: 'Gemini', color: '#4285f4', desc: 'Google DeepMind open-weights model, highly capable and optimized for developers.' },
  { prefix: 'deepseek', name: 'DeepSeek', color: '#ef4444', desc: 'Chinese frontier model known for reasoning strength and efficiency.' },
  { prefix: 'grok', name: 'Grok', color: '#6366f1', desc: 'xAI model - values free speech, minimal guardrails, and directness.' },
  { prefix: 'llama', name: 'Llama', color: '#1877f2', desc: "Meta's open-weights model, designed to be highly versatile and customizable." },
  { prefix: 'qwen', name: 'Qwen', color: '#8b5cf6', desc: "Alibaba's advanced open-weights model with strong multi-lingual capabilities." },
  { prefix: 'mistral', name: 'Mistral', color: '#f97316', desc: 'Mistral AI frontier model, optimized for speed, efficiency, and reasoning.' },
  { prefix: 'glm', name: 'GLM', color: '#2563eb', desc: "Zhipu AI's bilingual conversational model, optimized for Chinese and English." },
  { prefix: 'kimi', name: 'Kimi', color: '#ea580c', desc: "Moonshot AI's Kimi chatbot, famous for its exceptionally long context window." },
  { prefix: 'minimax', name: 'MiniMax', color: '#ec4899', desc: "MiniMax's high-performance conversational model, optimized for creative writing and roleplay." },
  { prefix: 'mimo', name: 'Mimo', color: '#14b8a6', desc: 'Experimental or niche AI model with specialized capabilities.' },
  { prefix: 'raptor', name: 'Raptor', color: '#3b82f6', desc: 'Advanced preview model showcasing rapid inference speeds.' },
  { prefix: 'trinity', name: 'Trinity', color: '#10b981', desc: 'High-performance model utilizing advanced multi-step reasoning.' },
  { prefix: 'vierra', name: 'Vierra', color: '#6366f1', desc: 'Conversational AI model focused on highly human-like interactions.' }
];

function getBrandConfig(filename) {
  const lowercase = filename.toLowerCase();
  for (const conf of BRAND_CONFIGS) {
    if (lowercase.startsWith(conf.prefix)) {
      return conf;
    }
  }
  // Fallback
  const firstWord = filename.split('-')[0];
  const capitalized = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
  return {
    prefix: firstWord,
    name: capitalized,
    color: '#0071e3',
    desc: 'Advanced conversational AI model.'
  };
}

function getModelVersion(filename) {
  let name = filename.replace(/\.txt$/, '');
  
  // Replace versions like "4-5" with "4.5", "4-6" with "4.6", "4-8" with "4.8", "3-5" with "3.5", "3-1" with "3.1", "2-0" with "2.0", "2-5" with "2.5", "5-2" with "5.2", "5-4" with "5.4", "5-5" with "5.5", "4-1" with "4.1", "4-3" with "4.3", "k2-5" with "K2.5", "m2-7" with "M2.7", "v2-5" with "V2.5"
  name = name.replace(/-(\d)-(\d)/g, '-$1.$2');
  
  let words = name.split('-');
  words = words.map(w => {
    if (w === 'gpt') return 'GPT';
    if (w === 'csam') return 'CSAM';
    if (w === 'it') return 'IT';
    if (w === 'insruct') return 'Instruct'; // handle typo
    if (w.match(/^\d+b$/i)) return w.toUpperCase(); // e.g. "27b" -> "27B"
    if (w.match(/^[a-z]\d+(\.\d+)?$/i)) return w.toUpperCase(); // e.g. "v2.5" -> "V2.5", "k2.5" -> "K2.5", "m2.7" -> "M2.7"
    if (w === 'glm') return 'GLM';
    if (w === 'qwen3') return 'Qwen3';
    return w.charAt(0).toUpperCase() + w.slice(1);
  });
  
  let finalName = words.join(' ');
  finalName = finalName.replace('Deepseek', 'DeepSeek');
  finalName = finalName.replace('Minimax', 'MiniMax');
  finalName = finalName.replace('Xhigh', 'X-High');
  
  return finalName;
}

function getRandomAnswer(type) {
  if (type === 'binary') {
    return Math.floor(Math.random() * 2) + 1; // 1 or 2
  } else if (type === 'multiple_choice') {
    return Math.floor(Math.random() * 4) + 1; // 1, 2, 3, or 4
  } else {
    // scale
    return Math.floor(Math.random() * 5) + 1; // 1, 2, 3, 4, or 5
  }
}

// 3. Scan folder and parse each file
console.log('Scanning ai_answers directory...');
const files = fs.readdirSync(folderPath);

for (const file of files) {
  const filePath = path.join(folderPath, file);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || !file.endsWith('.txt')) {
    continue;
  }
  
  const brand = getBrandConfig(file);
  const version = getModelVersion(file);
  const key = `${brand.name}|||${version}`;
  
  console.log(`Processing file: ${file} -> Model: ${brand.name}, Version: ${version}`);
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const parsed = {};
  
  // First pass: parse lines that have explicit numbers (e.g. Q99: 4 or Q99 : 4)
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const match = line.match(/Q?(\d+)\s*:\s*(\d+)/i);
    if (match) {
      const qId = parseInt(match[1]);
      const val = parseInt(match[2]);
      parsed[idx] = { qId, val };
    }
  }
  
  // Second pass: fill in lines that are missing the Q number, e.g., ": 4"
  for (let idx = 0; idx < lines.length; idx++) {
    if (!parsed[idx]) {
      const line = lines[idx];
      const match = line.match(/^\s*:\s*(\d+)/);
      if (match) {
        const val = parseInt(match[1]);
        // Try to infer from subsequent lines
        let inferredQId = null;
        for (let nextIdx = idx + 1; nextIdx < lines.length; nextIdx++) {
          if (parsed[nextIdx]) {
            inferredQId = parsed[nextIdx].qId - (nextIdx - idx);
            break;
          }
        }
        // If we couldn't infer from subsequent, try previous lines
        if (inferredQId === null) {
          for (let prevIdx = idx - 1; prevIdx >= 0; prevIdx--) {
            if (parsed[prevIdx]) {
              inferredQId = parsed[prevIdx].qId + (idx - prevIdx);
              break;
            }
          }
        }
        
        if (inferredQId !== null && inferredQId >= 1 && inferredQId <= 100) {
          parsed[idx] = { qId: inferredQId, val };
        }
      }
    }
  }
  
  // Collect actual answers parsed
  const fileAnswers = {};
  for (const idx in parsed) {
    const { qId, val } = parsed[idx];
    fileAnswers[qId] = val;
  }
  
  // Build 100 answers, filling missing with random answers
  const finalAnswers = [];
  let filledCount = 0;
  for (let id = 1; id <= 100; id++) {
    let val = fileAnswers[id];
    if (val === undefined || isNaN(val)) {
      const type = questionTypes[id] || 'scale';
      val = getRandomAnswer(type);
      filledCount++;
    }
    finalAnswers.push({
      ai_name: brand.name,
      model_version: version,
      color_hex: brand.color,
      description: brand.desc,
      question_id: id,
      answer_value: val
    });
  }
  
  if (filledCount > 0) {
    console.log(`  -> Filled ${filledCount} missing questions with random answers.`);
  }
  
  // Overwrite or store in map (this ensures we replace any existing under same key)
  rowsByModel[key] = finalAnswers;
}

// 4. Reconstruct the new CSV contents
console.log('Writing back to ai_answers.csv...');
const header = 'ai_name,model_version,color_hex,description,question_id,answer_value\n';
let newCSVContent = header;

// Sort profiles so they appear in a consistent, nice order in the CSV
const sortedKeys = Object.keys(rowsByModel).sort();
let totalLines = 0;

for (const key of sortedKeys) {
  const rows = rowsByModel[key];
  for (const row of rows) {
    // escape description if it has commas
    let escapedDesc = row.description;
    if (escapedDesc && (escapedDesc.includes(',') || escapedDesc.includes('"'))) {
      escapedDesc = `"${escapedDesc.replace(/"/g, '""')}"`;
    }
    
    // escape model_version if it has commas
    let escapedVersion = row.model_version;
    if (escapedVersion && (escapedVersion.includes(',') || escapedVersion.includes('"'))) {
      escapedVersion = `"${escapedVersion.replace(/"/g, '""')}"`;
    }
    
    newCSVContent += `${row.ai_name},${escapedVersion},${row.color_hex},${escapedDesc},${row.question_id},${row.answer_value}\n`;
    totalLines++;
  }
}

fs.writeFileSync(csvPath, newCSVContent, 'utf-8');
console.log(`Successfully wrote ${totalLines} rows across ${sortedKeys.length} profiles to ${csvPath}!`);
