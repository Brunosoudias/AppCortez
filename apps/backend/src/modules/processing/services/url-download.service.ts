import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createWriteStream, existsSync } from 'fs';
import { readdir, unlink } from 'fs/promises';
import { get as httpGet, type IncomingMessage, type RequestOptions } from 'http';
import { get as httpsGet } from 'https';
import { basename, extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { URL } from 'url';
import { ALLOWED_VIDEO_EXTENSIONS } from '../../../common/utils/constants';
import { resolveYtDlpPath } from '../../../common/utils/resolve-yt-dlp.util';

const PLATFORM_HOST_RE =
  /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|fb\.watch)$/i;

const MAX_REDIRECTS = 5;

/**
 * Baixa vídeos a partir de URL:
 * - URLs de plataforma (YouTube, etc.): via yt-dlp (binário no PATH ou YT_DLP_PATH)
 * - URL direta de arquivo de vídeo: HTTP(S) com follow de redirects
 */
@Injectable()
export class UrlDownloadService {
  private readonly logger = new Logger(UrlDownloadService.name);
  private readonly ytDlpPath: string;

  constructor(private readonly configService: ConfigService) {
    this.ytDlpPath = resolveYtDlpPath(this.configService.get<string>('app.ytDlpPath'));
    this.logger.log(`yt-dlp: ${this.ytDlpPath}`);
  }

  isPlatformUrl(sourceUrl: string): boolean {
    try {
      const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./i, '');
      return PLATFORM_HOST_RE.test(host);
    } catch {
      return false;
    }
  }

  /**
   * Obtém o título do vídeo (YouTube/Vimeo/etc.) via yt-dlp sem baixar o arquivo.
   * Retorna null se não for URL de plataforma ou se a consulta falhar.
   */
  async fetchVideoTitle(sourceUrl: string): Promise<string | null> {
    if (!this.isPlatformUrl(sourceUrl)) return null;

    const cookiesFile = (this.configService.get<string>('app.ytDlpCookiesFile') ?? '').trim();
    const preferredBrowser = (this.configService.get<string>('app.ytDlpBrowser') ?? '').trim();
    const printArgs = ['--skip-download', '--no-playlist', '--print', '%(title)s'];

    const attempts: string[][] = [];
    if (cookiesFile) {
      attempts.push([...printArgs, '--cookies', cookiesFile, sourceUrl]);
    }
    attempts.push([...printArgs, sourceUrl]);
    for (const browser of this.listAvailableBrowsers(preferredBrowser).slice(0, 2)) {
      attempts.push([...printArgs, '--cookies-from-browser', browser, sourceUrl]);
    }

    for (const args of attempts) {
      try {
        const title = await this.runYtDlpCapture(args);
        const cleaned = title
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .pop();
        if (cleaned && cleaned.length > 1 && !/^NA$/i.test(cleaned)) {
          return cleaned.slice(0, 120);
        }
      } catch (err) {
        this.logger.warn(`yt-dlp title falhou: ${(err as Error).message.slice(0, 160)}`);
      }
    }
    return null;
  }

  /**
   * Baixa o vídeo para `destDir` e retorna o caminho absoluto do arquivo
   * (ex: .../original.mp4). O nome base é sempre `original` + extensão.
   */
  async downloadToFile(sourceUrl: string, destDir: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new BadRequestException('URL inválida');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Apenas URLs http(s) são aceitas');
    }

    if (this.isPlatformUrl(sourceUrl)) {
      return this.downloadWithYtDlp(sourceUrl, destDir);
    }

    const extFromUrl = this.extractAllowedExtension(parsed.pathname);
    if (extFromUrl) {
      const outputPath = join(destDir, `original${extFromUrl}`);
      await this.downloadDirect(sourceUrl, outputPath);
      return outputPath;
    }

    // Sem extensão clara: tenta yt-dlp (muitos hosts de CDN); se falhar, HTTP + sniff.
    try {
      return await this.downloadWithYtDlp(sourceUrl, destDir);
    } catch (ytErr) {
      this.logger.warn(`yt-dlp falhou para URL genérica, tentando download direto: ${(ytErr as Error).message}`);
      const outputPath = join(destDir, 'original.mp4');
      await this.downloadDirect(sourceUrl, outputPath);
      return outputPath;
    }
  }

  private async downloadWithYtDlp(sourceUrl: string, destDir: string): Promise<string> {
    const outputTemplate = join(destDir, 'original.%(ext)s');
    const baseArgs = [
      '--no-playlist',
      '--newline',
      '-f',
      'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
      '--merge-output-format',
      'mp4',
      '-o',
      outputTemplate,
      '--js-runtimes',
      'deno',
    ];

    const cookiesFile = (this.configService.get<string>('app.ytDlpCookiesFile') ?? '').trim();
    const preferredBrowser = (this.configService.get<string>('app.ytDlpBrowser') ?? '').trim();

    // 1) Se há cookies.txt configurado, usa direto (mais confiável em age-gate)
    if (cookiesFile) {
      try {
        await this.runYtDlp([...baseArgs, '--cookies', cookiesFile, sourceUrl]);
        return await this.findDownloadedOriginal(destDir);
      } catch (err) {
        this.logger.warn(`yt-dlp com cookies file falhou: ${(err as Error).message}`);
      }
    }

    // 2) Tentativa sem cookies
    try {
      await this.runYtDlp([...baseArgs, sourceUrl]);
      return await this.findDownloadedOriginal(destDir);
    } catch (err) {
      const msg = (err as Error).message ?? '';

      if (/não encontrado|ENOENT|not found/i.test(msg)) {
        throw new BadRequestException(
          'Para baixar vídeos de YouTube/Vimeo/etc. instale o yt-dlp e defina YT_DLP_PATH no .env. URLs diretas (.mp4) funcionam sem yt-dlp.',
        );
      }

      const needsAuth = /sign in|age|confirm your age|login required|cookies|members-only|private video/i.test(msg);
      if (!needsAuth) {
        throw new BadRequestException(`Falha ao baixar o vídeo pela URL. Detalhe: ${msg.slice(0, 220)}`);
      }

      // 3) Cookies de navegadores que realmente existem no PC
      const browsers = this.listAvailableBrowsers(preferredBrowser);
      const errors: string[] = [];

      for (const browser of browsers) {
        try {
          this.logger.warn(`Retry yt-dlp com cookies do ${browser}…`);
          await this.runYtDlp([...baseArgs, '--cookies-from-browser', browser, sourceUrl]);
          return await this.findDownloadedOriginal(destDir);
        } catch (cookieErr) {
          const detail = (cookieErr as Error).message ?? String(cookieErr);
          errors.push(`${browser}: ${detail.split('\n').pop()}`);
          this.logger.warn(`Cookies ${browser} falharam: ${detail.slice(0, 200)}`);
        }
      }

      throw new BadRequestException(
        [
          'Este vídeo exige login/verificação de idade no YouTube.',
          'Opções:',
          '1) Faça upload do arquivo .mp4',
          '2) Feche o Chrome/Edge, abra o vídeo logado no YouTube, feche o navegador e tente de novo',
          '3) Exporte cookies.txt e defina YT_DLP_COOKIES_FILE no .env (extensão "Get cookies.txt LOCALLY")',
          preferredBrowser ? `Navegador preferido: ${preferredBrowser}` : `Navegadores tentados: ${browsers.join(', ') || 'nenhum'}`,
          errors.length ? `Detalhe: ${errors[0].slice(0, 160)}` : '',
        ]
          .filter(Boolean)
          .join(' '),
      );
    }
  }

  /** Só tenta navegadores cujo perfil existe (evita erro do Brave inexistente). */
  private listAvailableBrowsers(preferred?: string): string[] {
    const local = process.env.LOCALAPPDATA || '';
    const roaming = process.env.APPDATA || '';

    const catalog: Array<{ id: string; paths: string[] }> = [
      {
        id: 'chrome',
        paths: [join(local, 'Google', 'Chrome', 'User Data')],
      },
      {
        id: 'edge',
        paths: [join(local, 'Microsoft', 'Edge', 'User Data')],
      },
      {
        id: 'firefox',
        paths: [join(roaming, 'Mozilla', 'Firefox')],
      },
      {
        id: 'brave',
        paths: [join(local, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      },
    ];

    const installed = catalog
      .filter((b) => b.paths.some((p) => p && existsSync(p)))
      .map((b) => b.id);

    if (preferred) {
      const pref = preferred.toLowerCase().split(':')[0];
      if (installed.includes(pref)) {
        return [preferred, ...installed.filter((b) => b !== pref)];
      }
      // ainda tenta o preferido (perfil custom tipo chrome:Profile 1)
      return [preferred, ...installed];
    }

    return installed;
  }

  private async findDownloadedOriginal(destDir: string): Promise<string> {
    const files = await readdir(destDir);
    const preferred = files.find((f) => f === 'original.mp4');
    const fallback = files.find((f) => f.startsWith('original.') && !f.endsWith('.part'));
    const chosen = preferred ?? fallback;
    if (!chosen) {
      throw new InternalServerErrorException('Download concluído mas o arquivo de vídeo não foi encontrado');
    }
    return join(destDir, chosen);
  }

  private async downloadDirect(sourceUrl: string, outputPath: string, redirectsLeft = MAX_REDIRECTS): Promise<void> {
    const response = await this.httpGet(sourceUrl);

    if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
      response.resume();
      if (redirectsLeft <= 0) {
        throw new BadRequestException('Muitos redirects ao baixar o vídeo');
      }
      const next = new URL(response.headers.location, sourceUrl).toString();
      return this.downloadDirect(next, outputPath, redirectsLeft - 1);
    }

    if ((response.statusCode ?? 0) >= 400) {
      response.resume();
      throw new BadRequestException(`Servidor remoto retornou HTTP ${response.statusCode}`);
    }

    const contentType = (response.headers['content-type'] ?? '').toLowerCase();
    if (contentType && !contentType.startsWith('video/') && !contentType.includes('octet-stream') && !contentType.includes('mpegurl')) {
      // Ainda assim tentamos — alguns CDNs mentem o content-type
      this.logger.warn(`Content-Type inesperado no download direto: ${contentType}`);
    }

    try {
      await pipeline(response, createWriteStream(outputPath));
    } catch (err) {
      await this.safeUnlink(outputPath);
      throw new InternalServerErrorException(`Falha ao gravar o vídeo baixado: ${(err as Error).message}`);
    }
  }

  private httpGet(urlStr: string): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        reject(new BadRequestException('URL inválida'));
        return;
      }

      const lib = url.protocol === 'https:' ? httpsGet : httpGet;
      const opts: RequestOptions = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          'User-Agent': 'AI-Video-Cutter/0.1',
          Accept: '*/*',
        },
        timeout: 120_000,
      };

      const req = lib(opts, (res) => resolve(res));
      req.on('error', (err) => reject(new BadRequestException(`Falha de rede ao baixar: ${err.message}`)));
      req.on('timeout', () => {
        req.destroy();
        reject(new BadRequestException('Timeout ao baixar o vídeo'));
      });
    });
  }

  private runYtDlp(args: string[]): Promise<void> {
    return this.runYtDlpCapture(args).then(() => undefined);
  }

  private runYtDlpCapture(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.ytDlpPath, args, { shell: false });
      let stderr = '';
      let stdout = '';

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.on('error', (err) => {
        this.logger.error(`Falha ao executar yt-dlp (${this.ytDlpPath}): ${err.message}`);
        reject(new Error(`yt-dlp não encontrado (${err.message})`));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }
        this.logger.error(`yt-dlp saiu com código ${code}\n${stderr.slice(-2000)}`);
        reject(new Error(stderr.trim().split('\n').pop() || `yt-dlp exit ${code}`));
      });
    });
  }

  private extractAllowedExtension(pathname: string): string | null {
    const base = basename(pathname);
    const ext = extname(base).toLowerCase();
    if (ALLOWED_VIDEO_EXTENSIONS.includes(ext as (typeof ALLOWED_VIDEO_EXTENSIONS)[number])) {
      return ext;
    }
    return null;
  }

  private async safeUnlink(path: string): Promise<void> {
    try {
      await unlink(path);
    } catch {
      // ignore
    }
  }
}
