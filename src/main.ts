import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { KafkaService } from './kafka.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Ensure KafkaService is instantiated so onModuleInit() runs at boot
  app.get(KafkaService);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
