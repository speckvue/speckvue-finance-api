import { Module } from '@nestjs/common';
import UsersController from './users.controller';
import UsersService from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
class UsersModule {}

export default UsersModule;
