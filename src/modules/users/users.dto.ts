import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

class PreferencesDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
  @ApiProperty({ example: 'INR' })
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  baseCurrency!: string;
  @ApiProperty({ example: 'en-IN', maxLength: 40 })
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  locale!: string;
  @ApiProperty({ example: 'Asia/Kolkata', maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timezone!: string;
  @ApiProperty({ enum: ['light', 'dark', 'system'] })
  @IsIn(['light', 'dark', 'system'])
  theme!: 'light' | 'dark' | 'system';
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 is Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekStartsOn!: number;
}

class UserResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'email' }) email!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) displayName!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) baseCurrency!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) locale!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) timezone!:
    string | null;
  @ApiProperty({ enum: ['light', 'dark', 'system'] }) theme!: string;
  @ApiProperty() weekStartsOn!: number;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  onboardedAt!: Date | null;
}
export { PreferencesDto, UserResponse };
export default UserResponse;
