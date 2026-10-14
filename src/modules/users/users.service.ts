import { Injectable, NotFoundException } from '@nestjs/common';
import PrismaService from '../../database/prisma.service';

@Injectable()
class UsersService {
  constructor(private readonly db: PrismaService) {}

  credentials(email: string) {
    return this.db.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
  }

  async profile(id: string) {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) throw new NotFoundException();
    return user;
  }
}

export default UsersService;
