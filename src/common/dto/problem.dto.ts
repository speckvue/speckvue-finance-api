import { ApiProperty } from '@nestjs/swagger';

class ProblemResponse {
  @ApiProperty({ example: 'about:blank' })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: number;

  @ApiProperty()
  detail!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty({ format: 'uuid' })
  requestId!: string;
}

export default ProblemResponse;
