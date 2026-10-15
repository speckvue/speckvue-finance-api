import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const accountTypes = [
  'bank',
  'cash',
  'credit_card',
  'investment',
  'loan',
  'other',
] as const;

class AccountInput {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({ enum: accountTypes })
  @IsIn(accountTypes)
  type!: (typeof accountTypes)[number];

  @ApiProperty({ example: 'INR' })
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @ApiProperty({
    type: String,
    example: '1250.50',
    description:
      'Exact decimal string; amounts owed are negative. Maximum 15 integer digits and currency-specific fractional precision.',
  })
  @IsString()
  @Matches(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  openingBalance!: string;

  @ApiProperty({ example: '2026-10-16', format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  openingBalanceDate!: string;
}

class AccountsQuery {
  @ApiPropertyOptional({ enum: ['active', 'archived'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Last account ID from the previous page. Pages contain at most 50 accounts.',
  })
  @IsOptional()
  @IsUUID()
  after?: string;
}

class AccountResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: accountTypes }) type!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: String }) openingBalance!: string;
  @ApiProperty({ format: 'date' }) openingBalanceDate!: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class AccountsResponse {
  @ApiProperty({ type: [AccountResponse] }) items!: AccountResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export {
  AccountInput,
  AccountResponse,
  AccountsQuery,
  AccountsResponse,
  accountTypes,
};
export default AccountInput;
