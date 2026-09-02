import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClipTextDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  titleCta?: string;

  /** Re-renderiza o MP4 após alterar o texto (padrão: true se o corte já estiver pronto). */
  @IsOptional()
  @IsBoolean()
  rerender?: boolean;
}
