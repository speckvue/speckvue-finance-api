import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const payeeKinds = ['person', 'merchant', 'organization'] as const;
class PayeeInput {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;
  @ApiProperty({ enum: payeeKinds })
  @IsIn(payeeKinds)
  kind!: (typeof payeeKinds)[number];
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
class PayeesQuery {
  @ApiPropertyOptional({
    enum: ['active', 'archived', 'merged'],
    default: 'active',
  })
  @IsOptional()
  @IsIn(['active', 'archived', 'merged'])
  status?: 'active' | 'archived' | 'merged';
  @ApiPropertyOptional({ enum: payeeKinds })
  @IsOptional()
  @IsIn(payeeKinds)
  kind?: (typeof payeeKinds)[number];
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Last ID from the previous page, using the same filters.',
  })
  @IsOptional()
  @IsUUID()
  after?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Exclude the merge source from active target choices.',
  })
  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
class PayeeMergeInput {
  @ApiProperty({
    format: 'uuid',
    description: 'The active owned payee whose details will be kept.',
  })
  @IsUUID()
  targetId!: string;
}
class PayeeResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: payeeKinds }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) mergedIntoId!:
    string | null;
  @ApiProperty({ type: String, nullable: true }) mergedIntoName!: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  mergedAt!: Date | null;
  @ApiProperty({
    description: 'Number of merged source records, not a transaction count.',
  })
  mergedNameCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}
class PayeesResponse {
  @ApiProperty({ type: [PayeeResponse] }) items!: PayeeResponse[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export {
  PayeeInput,
  payeeKinds,
  PayeeMergeInput,
  PayeeResponse,
  PayeesQuery,
  PayeesResponse,
};
export default PayeeInput;
