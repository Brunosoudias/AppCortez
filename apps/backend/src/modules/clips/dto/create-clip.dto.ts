import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { ClipAspectRatio, ClipLayout } from '@ai-video-cutter/shared-types';

export class CreateClipDto {
  @IsNumber()
  @Min(0)
  startTime!: number;

  @IsNumber()
  @Min(0)
  endTime!: number;

  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  format?: ClipAspectRatio;

  @IsOptional()
  @IsIn(['crop', 'stack', 'title', 'blur'])
  layout?: ClipLayout;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  titleCta?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cropCenterX?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  cropCenterXBottom?: number;
}
