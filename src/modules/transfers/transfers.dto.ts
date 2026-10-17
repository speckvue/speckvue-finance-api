import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Principal amounts are actual amounts before any separately recorded fee; rates are derived. */
class TransferInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceAccountId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() destinationAccountId!: string;
  @ApiProperty({
    description: 'Positive exact amount in the source account currency.',
  })
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  sentAmount!: string;
  @ApiProperty({
    description:
      'Positive exact amount in the destination currency, before a separate fee.',
  })
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  receivedAmount!: string;
  @ApiPropertyOptional({ default: '0' })
  @IsOptional()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  feeAmount?: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  feeAccountId?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  feeCategoryId?: string | null;
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
class TransferCreateInput extends TransferInput {
  @ApiProperty({
    format: 'uuid',
    description: 'Keep the same key for retries of this entry.',
  })
  @IsUUID()
  requestId!: string;
}
class TransferUpdateInput extends TransferInput {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) revision!: number;
}
class TransferDeleteInput {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) revision!: number;
}
class TransfersQuery {
  @ApiPropertyOptional({ enum: ['active', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'deleted'])
  status?: 'active' | 'deleted';
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Any involved owned account, including the fee account.',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  after?: string;
}
class TransferHistoryQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
}
class TransferMovementResponse {
  @ApiProperty({ format: 'uuid' }) accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: ['outgoing', 'incoming', 'fee'] }) role!: string;
  @ApiProperty({ enum: ['transfer', 'expense'] }) classification!: string;
  @ApiProperty({ description: 'Signed exact decimal.' }) amount!: string;
}
class TransferResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) sourceAccountId!: string;
  @ApiProperty() sourceAccountName!: string;
  @ApiProperty() sourceCurrency!: string;
  @ApiProperty({ format: 'uuid' }) destinationAccountId!: string;
  @ApiProperty() destinationAccountName!: string;
  @ApiProperty() destinationCurrency!: string;
  @ApiProperty() sentAmount!: string;
  @ApiProperty() receivedAmount!: string;
  @ApiProperty({
    description:
      'Destination units per 1 source unit, derived from actual amounts; 30 decimal places.',
  })
  exchangeRate!: string;
  @ApiProperty() feeAmount!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) feeAccountId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) feeAccountName!: string | null;
  @ApiProperty({ type: String, nullable: true }) feeCurrency!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  feeCategoryId!: string | null;
  @ApiProperty({ type: String, nullable: true }) feeCategoryName!:
    string | null;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() revision!: number;
  @ApiProperty() accountsArchived!: boolean;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [TransferMovementResponse] })
  movements!: TransferMovementResponse[];
}
class TransfersResponse {
  @ApiProperty({ type: [TransferResponse] }) items!: TransferResponse[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) nextCursor!:
    string | null;
}
class TransferRevisionResponse {
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['created', 'updated', 'deleted'] }) action!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: TransferResponse }) snapshot!: TransferResponse;
}
class TransferHistoryResponse {
  @ApiProperty({ type: [TransferRevisionResponse] })
  items!: TransferRevisionResponse[];
  @ApiProperty({ type: Number, nullable: true }) nextRevision!: number | null;
}
export {
  TransferCreateInput,
  TransferDeleteInput,
  TransferHistoryQuery,
  TransferHistoryResponse,
  TransferInput,
  TransferResponse,
  TransfersQuery,
  TransfersResponse,
  TransferUpdateInput,
};
export default TransferInput;
