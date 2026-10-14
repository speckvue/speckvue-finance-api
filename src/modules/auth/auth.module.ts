import { Global, Module } from '@nestjs/common';
import UsersModule from '../users/users.module';
import AuthController from './auth.controller';
import AuthService from './auth.service';
import PasswordService from './password.service';
import SessionService from './session.service';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService],
  exports: [SessionService],
})
class AuthModule {}

export default AuthModule;
