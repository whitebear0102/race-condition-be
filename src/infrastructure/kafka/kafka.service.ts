import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const broker = this.configService.getOrThrow<string>('KAFKA_BROKER');
    const kafkaAdmin = new Kafka({
      clientId: 'admin-setup',
      brokers: [broker],
    }).admin();

    let isAdminConnected = false;
    while (!isAdminConnected) {
      try {
        await kafkaAdmin.connect();
        isAdminConnected = true;
      } catch {
        console.log(
          '⏳ Kafka Broker chưa sẵn sàng. Đang thử kết nối lại sau 2 giây...',
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const existingTopics = await kafkaAdmin.listTopics();

    if (!existingTopics.includes('order_created')) {
      await kafkaAdmin.createTopics({
        topics: [{ topic: 'order_created', numPartitions: 1 }],
      });
      console.log('✅ Đã tự động khởi tạo Topic: order_created');
    }
    await kafkaAdmin.disconnect();

    let isClientConnected = false;
    while (!isClientConnected) {
      try {
        await this.kafkaClient.connect();
        isClientConnected = true;
        console.log('✅ Connected to Kafka Producer');
      } catch {
        console.log(
          '⏳ Kafka Client chưa sẵn sàng. Đang thử kết nối lại sau 2 giây...',
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  async onModuleDestroy() {
    await this.kafkaClient.close();
  }

  sendOrderEvent(productId: number, userId: number, idempotencyKey: string) {
    const topic = 'order_created';
    const message = {
      productId,
      userId,
      timestamp: new Date().toISOString(),
      idempotencyKey,
    };

    console.log(
      `✅ [Kafka] Đã đẩy sự kiện tạo đơn hàng cho User ${userId} vào topic ${topic}`,
    );

    this.kafkaClient.emit(topic, message).subscribe({
      next: () => {
        // no-op
      },
      complete: () => {
        // no-op
      },
      error: (err) => {
        console.error(
          `❌ [Kafka] Lỗi khi đẩy sự kiện cho User ${userId}:`,
          err,
        );
      },
    });
  }
}
