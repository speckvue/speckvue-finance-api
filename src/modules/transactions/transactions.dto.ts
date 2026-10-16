import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';

class SplitInput {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
  @ApiProperty({ description: 'Positive exact decimal string.' })
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  amount!: string;
}

/** Full replacement input; omitted payee and category mean explicitly unassigned. */
class TransactionInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() accountId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  payeeId?: string | null;
  @ApiProperty({ enum: ['income', 'expense', 'refund'] })
  @IsIn(['income', 'expense', 'refund'])
  kind!: 'income' | 'expense' | 'refund';
  @ApiProperty()
  @Matches(/^(?:0|[1-9]\d{0,14})(?:\.\d{1,4})?$/)
  amount!: string;
  @ApiProperty({ format: 'date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date!: string;
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
  @ApiProperty({ type: [SplitInput], minItems: 1, maxItems: 20 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => SplitInput)
  splits!: SplitInput[];
}
class TransactionCreateInput extends TransactionInput {
  @ApiProperty({
    format: 'uuid',
    description:
      'Retry the same request with the same key to avoid a duplicate posting.',
  })
  @IsUUID()
  requestId!: string;
}
class TransactionUpdateInput extends TransactionInput {
  @ApiProperty({
    description: 'Expected current revision; stale writes return 409.',
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  revision!: number;
}
class TransactionDeleteInput {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) revision!: number;
}
class TransactionsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
  @ApiPropertyOptional({ enum: ['active', 'deleted'] })
  @IsOptional()
  @IsIn(['active', 'deleted'])
  status?: 'active' | 'deleted';
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  after?: string;
}
class TransactionHistoryQuery {
  @ApiPropertyOptional({
    description: 'Read revisions older than this revision.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  before?: number;
}
class TransactionSplitResponse {
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) categoryId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @ApiProperty({
    description: 'Exact decimal string with four fractional digits.',
  })
  amount!: string;
}
class TransactionResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) accountId!: string;
  @ApiProperty() accountName!: string;
  @ApiProperty() accountArchived!: boolean;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) payeeId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) payeeName!: string | null;
  @ApiProperty({ enum: ['income', 'expense', 'refund'] }) kind!: string;
  @ApiProperty({
    description:
      'Positive exact decimal string; kind determines its balance effect.',
  })
  amount!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() revision!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  deletedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ type: [TransactionSplitResponse] })
  splits!: TransactionSplitResponse[];
}
class TransactionsResponse {
  @ApiProperty({ type: [TransactionResponse] }) items!: TransactionResponse[];
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) nextCursor!:
    string | null;
}
class TransactionRevisionResponse {
  @ApiProperty() revision!: number;
  @ApiProperty({ enum: ['created', 'updated', 'deleted'] }) action!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: TransactionResponse }) snapshot!: TransactionResponse;
}
class TransactionHistoryResponse {
  @ApiProperty({ type: [TransactionRevisionResponse] })
  items!: TransactionRevisionResponse[];
  @ApiProperty({ type: Number, nullable: true }) nextRevision!: number | null;
}
export {
  TransactionCreateInput,
  TransactionDeleteInput,
  TransactionHistoryQuery,
  TransactionHistoryResponse,
  TransactionInput,
  TransactionResponse,
  TransactionsQuery,
  TransactionsResponse,
  TransactionUpdateInput,
};
export default TransactionInput;
