import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AppSettings, CaptionStyle, ClipAspectRatio, WhisperMode } from '@ai-video-cutter/shared-types';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsIn(['auto', 'openai', 'cli', 'heuristic'])
  whisperMode?: WhisperMode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  whisperCliPath?: string;

  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  defaultClipFormat?: ClipAspectRatio;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  defaultClipDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAutoClips?: number;

  @IsOptional()
  @IsBoolean()
  faceTrackingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  burnCaptionsByDefault?: boolean;

  @IsOptional()
  @IsIn(['clean', 'boxed', 'reels', 'karaoke'])
  captionStyle?: CaptionStyle;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<AppSettings> {
    return this.settings.get();
  }

  @Patch()
  update(@Body() body: UpdateSettingsDto): Promise<AppSettings> {
    return this.settings.update(body);
  }
}
