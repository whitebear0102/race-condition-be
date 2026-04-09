import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { KafkaService } from './../src/infrastructure/kafka/kafka.service';
import { OrderCreatedConsumer } from './../src/infrastructure/kafka/order-created.consumer';
import { RedisStockService } from './../src/infrastructure/redis/redis-stock.service';
import { PrismaService } from './../src/infrastructure/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KafkaService)
      .useValue({
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
        sendOrderEvent: jest.fn(),
      })
      .overrideProvider(RedisStockService)
      .useValue({
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
        reserveProduct: jest.fn(),
        setStock: jest.fn(),
      })
      .overrideProvider(OrderCreatedConsumer)
      .useValue({
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});
