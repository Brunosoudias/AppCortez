import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * Resolve o binário yt-dlp: env → PATH name → caminhos comuns do WinGet.
 */
export function resolveYtDlpPath(configured?: string): string {
  const candidates: string[] = [];

  if (configured?.trim()) {
    candidates.push(configured.trim());
  }

  candidates.push('yt-dlp', 'yt-dlp.exe');

  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const wingetRoot = join(localAppData, 'Microsoft', 'WinGet', 'Packages');

  // Caminho conhecido da instalação winget yt-dlp.yt-dlp
  candidates.push(
    join(wingetRoot, 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
  );

  // Links do winget
  candidates.push(join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'));

  for (const candidate of candidates) {
    if (!candidate.includes('/') && !candidate.includes('\\') && !candidate.endsWith('.exe')) {
      // nome simples — deixa o spawn procurar no PATH
      continue;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // fallback: o que veio do env ou "yt-dlp"
  return configured?.trim() || 'yt-dlp';
}
