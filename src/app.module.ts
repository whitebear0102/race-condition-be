import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './redis.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { ClientsModule, KafkaOptions, Transport } from '@nestjs/microservices';
import { KafkaService } from './kafka.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Biến thành module toàn cục, các Service khác dùng không cần import lại

      // Joi sẽ kiểm tra file .env hoặc biến môi trường của hệ thống (Docker)
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),

        // Bắt buộc phải có DATABASE_URL (Cho Prisma sau này)
        DATABASE_URL: Joi.string().required(),

        // Bắt buộc phải có REDIS_HOST, nếu thiếu REDIS_PORT thì tự động lấy 6379
        REDIS_HOST: Joi.string().required(),
        REDIS_PORT: Joi.number().default(6379),

        // Bắt buộc phải có Kafka
        KAFKA_BROKER: Joi.string().required().default('kafka:9092'),
      }),
    }),

    // === ĐĂNG KÝ KAFKA CLIENT TẠI ĐÂY ===
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
            producerOnlyMode: true, // Cấu hình chỉ gửi tin nhắn để tối ưu hiệu năng
          },
        }),
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService, RedisService, KafkaService],
})
export class AppModule {}
