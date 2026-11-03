import { ArrayNotEmpty, IsArray, IsString } from "class-validator";

export class PracticeMasteredElementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
