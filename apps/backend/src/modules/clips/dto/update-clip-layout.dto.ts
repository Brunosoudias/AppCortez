import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type { ClipLayout } from '@ai-video-cutter/shared-types';

export class UpdateClipLayoutDto {
  @IsIn(['crop', 'title'])
  layout!: Extract<ClipLayout, 'crop' | 'title'>;

  /** Re-renderiza o MP4 após mudar o layout (padrão: true se o corte já estiver pronto). */
  @IsOptional()
  @IsBoolean()
  rerender?: boolean;
}
