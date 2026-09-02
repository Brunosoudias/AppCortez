import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateClipZoomDto {
  @IsNumber()
  @Min(0.5)
  @Max(2)
  centerZoom!: number;

  @IsOptional()
  @IsBoolean()
  rerender?: boolean;
}
