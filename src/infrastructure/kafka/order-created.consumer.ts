import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, Kafka } from 'kafkajs';
import { ProcessOrderCreatedApplicationService } from '../../application/order/process-order-created.application-service';

@Injectable()
export class OrderCreatedConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer | undefined;

  constructor(
    private readonly config: ConfigService,
    // Service này sẽ gọi Prisma để chạy Transaction lưu DB
    private readonly handler: ProcessOrderCreatedApplicationService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;

    const broker = this.config.getOrThrow<string>('KAFKA_BROKER');

    const kafka = new Kafka({
      clientId: 'race-condition-consumer',
      brokers: [broker],
      retry: {
        // Kafka trong Docker đôi khi cần vài giây để ổn định metadata/leader.
        // Lỗi "This server does not host this topic-partition" là retriable.
        initialRetryTime: 300,
        retries: 20,
      },
    });

    this.consumer = kafka.consumer({ groupId: 'race-condition-order-created' });

    let isConsumerReady = false;
    while (!isConsumerReady) {
      try {
        await this.consumer.connect();
        await this.consumer.subscribe({
          topic: 'order_created',
          fromBeginning: false,
        });
        isConsumerReady = true;
      } catch (err: any) {
        const retriable = Boolean(err?.retriable);
        console.log(
          `⏳ Kafka Consumer chưa sẵn sàng${
            retriable ? ' (retriable)' : ''
          }. Thử lại sau 2 giây...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    await this.consumer.run({
      // kafkajs mặc định là autoCommit: true
      eachMessage: async ({ message }) => {
        if (!message.value) return;

        let payload;
        try {
          payload = JSON.parse(message.value.toString('utf8'));
        } catch (parseError) {
          console.error(
            '❌ [Kafka] Invalid JSON payload:',
            message.value.toString(),
          );
          return; // Lỗi format thì bỏ qua luôn để commit offset, tránh kẹt hàng đợi
        }

        const productId = Number(payload.productId);
        const userId = Number(payload.userId);
        const timestamp =
          typeof payload.timestamp === 'string' ? payload.timestamp : undefined;
        const idempotencyKey = payload.idempotencyKey;

        if (!Number.isFinite(productId) || !Number.isFinite(userId)) {
          console.error(
            '❌ [Kafka] Missing productId or userId in payload:',
            payload,
          );
          return;
        }

        try {
          // Gọi sang Service chứa Prisma.$transaction
          await this.handler.handle({
            productId,
            userId,
            timestamp,
            idempotencyKey,
          });
          console.log(
            `✅ [Consumer] Xử lý thành công đơn hàng cho User ${userId}`,
          );
        } catch (err: any) {
          // 2. [XỬ LÝ IDEMPOTENCY] Bắt lỗi trùng lặp từ Prisma (Mã P2002)
          if (err.code === 'P2002') {
            console.log(
              `⚠️ [Idempotency] Đơn hàng cho User ${userId} và Product ${productId} đã tồn tại. Bỏ qua tin nhắn này.`,
            );
            // Return bình thường (không throw). Kafkajs sẽ hiểu là "đã xử lý xong"
            // và tự động Commit Offset, không gửi lại tin nhắn này nữa.
            return;
          }

          // 3. [XỬ LÝ DISASTER RECOVERY] Lỗi Database chết hoặc sập mạng
          console.error(
            `❌ [Kafka] Lỗi hệ thống khi xử lý User ${userId}:`,
            err.message,
          );

          // NẾU BẠN KHÔNG THROW: Kafka sẽ tưởng bạn đã làm xong và tự xóa tin nhắn.
          // KHI BẠN THROW: Kafkajs sẽ báo lỗi với Broker, không commit offset,
          // và tự động Retry (gửi lại) tin nhắn này theo cơ chế Backoff.
          throw err;
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
