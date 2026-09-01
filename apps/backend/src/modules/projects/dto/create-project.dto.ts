import { IsIn, IsNotEmpty, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';
import type { ProjectSourceType } from '@ai-video-cutter/shared-types';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsIn(['url', 'upload'])
  sourceType!: ProjectSourceType;

  @ValidateIf((dto: CreateProjectDto) => dto.sourceType === 'url')
  @IsNotEmpty({ message: 'sourceUrl é obrigatório quando sourceType é "url"' })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'sourceUrl deve ser uma URL http(s) válida' },
  )
  sourceUrl?: string;
}
