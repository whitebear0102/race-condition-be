import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { KafkaService } from './infrastructure/kafka/kafka.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.get(KafkaService);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
