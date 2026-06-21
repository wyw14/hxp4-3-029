import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import type { LevelsData, LevelData, ChallengeRecord, ChallengeRecordsData, ChallengeRules } from './types';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');
const CHALLENGE_FILE = path.join(DATA_DIR, 'challenge-records.json');

function loadLevels(): LevelsData {
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf-8');
    return JSON.parse(raw) as LevelsData;
  } catch (err) {
    console.error('Failed to load levels:', err);
    return { levels: [] };
  }
}

function saveLevels(data: LevelsData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save levels:', err);
    return false;
  }
}

function loadChallengeRecords(): ChallengeRecordsData {
  try {
    if (!fs.existsSync(CHALLENGE_FILE)) {
      return { records: [] };
    }
    const raw = fs.readFileSync(CHALLENGE_FILE, 'utf-8');
    return JSON.parse(raw) as ChallengeRecordsData;
  } catch (err) {
    console.error('Failed to load challenge records:', err);
    return { records: [] };
  }
}

function saveChallengeRecords(data: ChallengeRecordsData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CHALLENGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save challenge records:', err);
    return false;
  }
}

function rulesMatch(a: ChallengeRules, b: ChallengeRules): boolean {
  return a.timeLimit === b.timeLimit &&
    a.disableFrequencyDisplay === b.disableFrequencyDisplay &&
    a.maxErrors === b.maxErrors;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0.0001) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function isSimpleFrequencyRatio(f1: number, f2: number, maxDenom: number = 10): boolean {
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  if (minF < 0.0001) return false;

  const ratio = maxF / minF;

  for (let denom = 1; denom <= maxDenom; denom++) {
    const numer = ratio * denom;
    const rounded = Math.round(numer);
    if (Math.abs(numer - rounded) < 0.02 && rounded <= maxDenom && rounded > 0) {
      return true;
    }
  }

  return false;
}

app.get('/api/levels', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    total: data.levels.length,
    levels: data.levels.map((l: LevelData) => ({
      id: l.id,
      name: l.name,
      creatureName: l.creatureName
    }))
  });
});

app.get('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  res.json({
    success: true,
    level
  });
});

app.get('/api/levels/:id/verify', (req, res) => {
  const id = parseInt(req.params.id);
  const edgeParam = req.query.edge as string;

  if (!edgeParam) {
    res.status(400).json({
      success: false,
      error: 'Missing edge parameter'
    });
    return;
  }

  const [from, to] = edgeParam.split('-');
  if (!from || !to) {
    res.status(400).json({
      success: false,
      error: 'Invalid edge format, expected from-to'
    });
    return;
  }

  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  const fromPoint = level.anchorPoints.find(p => p.id === from);
  const toPoint = level.anchorPoints.find(p => p.id === to);

  if (!fromPoint || !toPoint) {
    res.json({
      success: true,
      valid: false,
      reason: 'Unknown anchor point'
    });
    return;
  }

  const isDefinedEdge = level.edges.some(
    e => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );

  const f1 = fromPoint.frequency;
  const f2 = toPoint.frequency;
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  const isHarmonic = isSimpleFrequencyRatio(f1, f2);

  res.json({
    success: true,
    valid: isDefinedEdge && isHarmonic,
    isHarmonic,
    isDefinedEdge,
    frequencies: {
      [from]: f1,
      [to]: f2
    },
    ratio: isHarmonic ? [minF, maxF] : null
  });
});

app.post('/api/levels', (req, res) => {
  const newLevel = req.body as LevelData;

  if (!newLevel.id || !newLevel.anchorPoints || !newLevel.edges) {
    res.status(400).json({
      success: false,
      error: 'Invalid level data'
    });
    return;
  }

  const data = loadLevels();
  const existing = data.levels.findIndex(l => l.id === newLevel.id);

  if (existing >= 0) {
    data.levels[existing] = newLevel;
  } else {
    data.levels.push(newLevel);
  }

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: newLevel
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save level'
    });
  }
});

app.get('/api/challenge/records', (_req, res) => {
  const data = loadChallengeRecords();
  res.json({
    success: true,
    total: data.records.length,
    records: data.records
  });
});

app.get('/api/challenge/records/:levelId', (req, res) => {
  const levelId = parseInt(req.params.levelId);
  const data = loadChallengeRecords();
  const records = data.records.filter(r => r.levelId === levelId);

  res.json({
    success: true,
    levelId,
    total: records.length,
    records: records.sort((a, b) => b.score - a.score)
  });
});

app.post('/api/challenge/records', (req, res) => {
  const record = req.body as Omit<ChallengeRecord, 'id' | 'completedAt'>;

  if (!record || record.levelId == null || !record.rules) {
    res.status(400).json({
      success: false,
      error: 'Invalid challenge record data'
    });
    return;
  }

  const data = loadChallengeRecords();

  const newRecord: ChallengeRecord = {
    ...record,
    id: `ch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    completedAt: Date.now()
  };

  data.records.push(newRecord);

  if (saveChallengeRecords(data)) {
    res.json({
      success: true,
      record: newRecord
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save challenge record'
    });
  }
});

app.delete('/api/challenge/records/:id', (req, res) => {
  const id = req.params.id;
  const data = loadChallengeRecords();
  const idx = data.records.findIndex(r => r.id === id);

  if (idx < 0) {
    res.status(404).json({
      success: false,
      error: `Challenge record ${id} not found`
    });
    return;
  }

  data.records.splice(idx, 1);

  if (saveChallengeRecords(data)) {
    res.json({
      success: true,
      deleted: id
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to delete challenge record'
    });
  }
});

app.get('/api/health', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    status: 'running',
    port: PORT,
    levelsLoaded: data.levels.length
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ 星座游戏服务器启动成功`);
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🎮 关卡数量: ${loadLevels().levels.length}\n`);
});
