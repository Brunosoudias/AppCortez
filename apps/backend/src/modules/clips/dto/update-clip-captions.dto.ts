import { IsBoolean } from 'class-validator';

export class UpdateClipCaptionsDto {
  @IsBoolean()
  enabled!: boolean;
}
