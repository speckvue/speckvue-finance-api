import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import Public from '../../common/decorators/public';
import PrismaService from '../../database/prisma.service';
import RedisService from '../../redis/redis.service';

class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

@Public()
@ApiTags('Health')
@Controller('health')
class HealthController {
  constructor(
    private readonly db: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @SkipThrottle()
  @ApiOkResponse({ type: HealthResponse })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ type: HealthResponse })
  async ready() {
    try {
      await Promise.all([this.db.$queryRaw`SELECT 1`, this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Service not ready');
    }
  }
}

export default HealthController;
