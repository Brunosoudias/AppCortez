import { IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

export class UpdateClipFramingDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(1)
  cropCenterX?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(1)
  cropCenterXBottom?: number | null;
}
