import { Module } from '@nestjs/common';
import CategoriesModule from '../categories/categories.module';
import PayeesModule from '../payees/payees.module';
import TransactionsController from './transactions.controller';
import TransactionsService from './transactions.service';

@Module({
  imports: [CategoriesModule, PayeesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
class TransactionsModule {}
export default TransactionsModule;
