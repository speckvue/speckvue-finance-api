import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const categoryKinds = ['income', 'expense'] as const;
const categoryColors = [
  'slate',
  'lime',
  'blue',
  'purple',
  'orange',
  'rose',
] as const;
const categoryIcons = [
  'tag',
  'home',
  'food',
  'transport',
  'shopping',
  'income',
  'health',
  'education',
  'travel',
  'gift',
  'leisure',
  'work',
] as const;

class CategoryInput {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  @Matches(/\S/)
  name!: string;

  @ApiProperty({
    enum: categoryKinds,
    description: 'Income/expense type is immutable after creation.',
  })
  @IsIn(categoryKinds)
  kind!: (typeof categoryKinds)[number];

  @ApiPropertyOptional({ maxLength: 240 })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ enum: categoryColors })
  @IsIn(categoryColors)
  color!: (typeof categoryColors)[number];

  @ApiProperty({ enum: categoryIcons })
  @IsIn(categoryIcons)
  icon!: (typeof categoryIcons)[number];

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

class CategoryMoveInput {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

class CategoryResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: categoryKinds }) kind!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: categoryColors }) color!: string;
  @ApiProperty({ enum: categoryIcons }) icon!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) parentId!:
    string | null;
  @ApiProperty() position!: number;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  archivedAt!: Date | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
}

class CategoriesResponse {
  @ApiProperty({
    type: [CategoryResponse],
    description:
      'All owned categories, including archived records; at most 500.',
  })
  items!: CategoryResponse[];
}

export {
  CategoriesResponse,
  categoryColors,
  categoryIcons,
  CategoryInput,
  categoryKinds,
  CategoryMoveInput,
  CategoryResponse,
};
export default CategoryInput;
