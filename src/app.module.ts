import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, KafkaOptions, Transport } from '@nestjs/microservices';
import * as Joi from 'joi';
import { AppService } from './application/app.service';
import { PlaceOrderApplicationService } from './application/order/place-order.application-service';
import { ProcessOrderCreatedApplicationService } from './application/order/process-order-created.application-service';
import { ProductManagementApplicationService } from './application/product/product-management.application-service';
import { OrderCreatedConsumer } from './infrastructure/kafka/order-created.consumer';
import { KafkaService } from './infrastructure/kafka/kafka.service';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisStockService } from './infrastructure/redis/redis-stock.service';
import { AppController } from './presentation/http/app.controller';
import { OrderController } from './presentation/http/order.controller';
import { ProductManagementController } from './presentation/http/product-management.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().default(6379),
        KAFKA_BROKER: Joi.string().required().default('kafka:9092'),
      }),
    }),
    PrismaModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: async (
          configService: ConfigService,
        ): Promise<KafkaOptions> => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: 'race-condition-producer',
              brokers: [configService.getOrThrow<string>('KAFKA_BROKER')],
            },
            producerOnlyMode: true,
          },
        }),
      },
    ]),
  ],
  controllers: [AppController, OrderController, ProductManagementController],
  providers: [
    AppService,
    RedisStockService,
    KafkaService,
    PlaceOrderApplicationService,
    ProcessOrderCreatedApplicationService,
    OrderCreatedConsumer,
    ProductManagementApplicationService,
  ],
})
export class AppModule {}
