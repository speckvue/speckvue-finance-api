import { ApiProperty } from '@nestjs/swagger';

class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export { UserResponse };

export default UserResponse;
