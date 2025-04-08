import { PartialType } from '@nestjs/mapped-types';
import { CreateExhibitorDto } from './create-exhibitor.dto';

export class UpdateExhibitorDto extends PartialType(CreateExhibitorDto) {}
