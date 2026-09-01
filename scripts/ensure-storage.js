#!/usr/bin/env node
/**
 * Garante que a estrutura de pastas de storage/ exista.
 * Roda automaticamente antes do backend subir (ver apps/backend/src/main.ts),
 * mas pode ser executado manualmente com: npm run setup:storage
 */
const fs = require('fs');
const path = require('path');

const STORAGE_ROOT = path.resolve(__dirname, '..', 'storage');

const DIRS = ['originals', 'temp', 'audio', 'transcripts', 'clips', 'exports', 'projects'];

for (const dir of DIRS) {
  const fullPath = path.join(STORAGE_ROOT, dir);
  fs.mkdirSync(fullPath, { recursive: true });
  const gitkeep = path.join(fullPath, '.gitkeep');
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, '');
  }
}

console.log(`✔ storage/ pronta em ${STORAGE_ROOT}`);
