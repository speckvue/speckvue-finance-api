import { Module } from '@nestjs/common';
import CategoriesModule from '../categories/categories.module';
import TransfersController from './transfers.controller';
import TransfersService from './transfers.service';

@Module({
  imports: [CategoriesModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
class TransfersModule {}
export default TransfersModule;
