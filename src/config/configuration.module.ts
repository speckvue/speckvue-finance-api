import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import SettingsService from './settings.service';
import validate from './validation';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', validate }),
  ],
  providers: [SettingsService],
  exports: [SettingsService],
})
class ConfigurationModule {}

export default ConfigurationModule;
