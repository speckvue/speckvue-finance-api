import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

class SigninDto {
  @ApiProperty({ maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

class SignupDto extends SigninDto {
  @ApiProperty({ minLength: 12, maxLength: 128, writeOnly: true })
  @MinLength(12)
  declare password: string;
}

class CsrfResponse {
  @ApiProperty()
  csrfToken!: string;
}

class AuthStatusResponse {
  @ApiProperty({ example: 'Signup request accepted.' })
  message!: string;
}

export { AuthStatusResponse, CsrfResponse, SigninDto, SignupDto };

export default SigninDto;
