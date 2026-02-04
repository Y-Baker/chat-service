import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'beforeAfter', async: false })
class BeforeAfterConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as QueryMessagesDto;
    return !(dto.before && dto.after);
  }

  defaultMessage(): string {
    return 'before and after cannot be provided together';
  }
}

export class QueryMessagesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @IsMongoId()
  before?: string;

  @IsOptional()
  @IsMongoId()
  after?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted: boolean = false;

  @Validate(BeforeAfterConstraint)
  private readonly beforeAfter?: string;
}
