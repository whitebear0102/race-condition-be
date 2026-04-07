import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import { ProcessOrderCreatedApplicationService } from '../../application/order/process-order-created.application-service';

@Injectable()
export class OrderCreatedConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer | undefined;

  constructor(
    private readonly config: ConfigService,
    private readonly handler: ProcessOrderCreatedApplicationService,
  ) {}

  async onModuleInit() {
    // Không connect Kafka khi chạy test
    if (process.env.NODE_ENV === 'test') return;

    const broker = this.config.getOrThrow<string>('KAFKA_BROKER');

    const kafka = new Kafka({
      clientId: 'race-condition-consumer',
      brokers: [broker],
    });

    this.consumer = kafka.consumer({ groupId: 'race-condition-order-created' });

    await this.consumer.connect();
    await this.consumer.subscribe({ topic: 'order_created', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        try {
          const payload = JSON.parse(message.value.toString('utf8'));
          const productId = Number(payload.productId);
          const userId = Number(payload.userId);
          const timestamp =
            typeof payload.timestamp === 'string' ? payload.timestamp : undefined;

          if (!Number.isFinite(productId) || !Number.isFinite(userId)) {
            console.error('❌ [Kafka] Invalid payload:', payload);
            return;
          }

          await this.handler.handle({ productId, userId, timestamp });
        } catch (err) {
          console.error('❌ [Kafka] order_created handler error:', err);
        }
      },
    });

    console.log('✅ Kafka consumer listening: order_created');
  }

  async onModuleDestroy() {
    if (this.consumer) {
      await this.consumer.disconnect();
    }
  }
}

