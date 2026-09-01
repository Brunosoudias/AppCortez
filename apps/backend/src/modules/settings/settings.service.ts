import { Injectable, OnModuleInit } from '@nestjs/common';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { AppSettings, UpdateAppSettingsPayload } from '@ai-video-cutter/shared-types';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../common/storage/storage.service';
import { SETTINGS_FILENAME } from '../../common/utils/constants';

const DEFAULTS: Omit<AppSettings, 'openaiConfigured' | 'ytDlpPath' | 'ffmpegPath' | 'ffprobePath'> = {
  language: 'pt-BR',
  whisperMode: 'auto',
  whisperCliPath: 'whisper',
  defaultClipFormat: '9:16',
  defaultClipDuration: 45,
  maxAutoClips: 8,
  faceTrackingEnabled: true,
  burnCaptionsByDefault: true,
  captionStyle: 'reels',
};

@Injectable()
export class SettingsService implements OnModuleInit {
  private cached: AppSettings | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.get();
  }

  async get(): Promise<AppSettings> {
    if (this.cached) return this.withEnv(this.cached);
    const fromDisk = await this.loadDisk();
    this.cached = { ...DEFAULTS, ...fromDisk } as AppSettings;
    return this.withEnv(this.cached);
  }

  async update(payload: UpdateAppSettingsPayload): Promise<AppSettings> {
    const current = await this.get();
    const next: AppSettings = {
      ...current,
      ...payload,
    };
    this.cached = next;
    await this.saveDisk(next);
    return this.withEnv(next);
  }

  private withEnv(settings: AppSettings): AppSettings {
    return {
      ...settings,
      openaiConfigured: !!(this.config.get<string>('app.openaiApiKey') ?? ''),
      ytDlpPath: this.config.get<string>('app.ytDlpPath') ?? 'yt-dlp',
      ffmpegPath: this.config.get<string>('app.ffmpegPath') ?? 'ffmpeg',
      ffprobePath: this.config.get<string>('app.ffprobePath') ?? 'ffprobe',
      whisperCliPath: settings.whisperCliPath || this.config.get<string>('app.whisperCliPath') || 'whisper',
      language: settings.language || this.config.get<string>('app.defaultLanguage') || 'pt-BR',
    };
  }

  private settingsPath(): string {
    return join(this.storage.getStorageRoot(), SETTINGS_FILENAME);
  }

  private async loadDisk(): Promise<Partial<AppSettings>> {
    try {
      const raw = await readFile(this.settingsPath(), 'utf-8');
      return JSON.parse(raw) as Partial<AppSettings>;
    } catch {
      return {};
    }
  }

  private async saveDisk(settings: AppSettings): Promise<void> {
    await mkdir(this.storage.getStorageRoot(), { recursive: true });
    const { openaiConfigured: _, ytDlpPath: __, ffmpegPath: ___, ffprobePath: ____, ...persistable } = settings;
    await writeFile(this.settingsPath(), JSON.stringify(persistable, null, 2), 'utf-8');
  }
}
