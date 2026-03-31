import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientKafka } from '@nestjs/microservices';
import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  constructor(
    // Inject KAFKA_SERVICE đã đăng ký ở AppModule
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const broker = this.configService.getOrThrow<string>('KAFKA_BROKER');
    const kafkaAdmin = new Kafka({
      clientId: 'admin-setup',
      brokers: [broker],
    }).admin();

    // 1. VÒNG LẶP KIÊN NHẪN CHỜ KAFKA KHỞI ĐỘNG
    let isAdminConnected = false;
    while (!isAdminConnected) {
      try {
        await kafkaAdmin.connect();
        isAdminConnected = true;
      } catch (error) {
        console.log(
          '⏳ Kafka Broker chưa sẵn sàng. Đang thử kết nối lại sau 2 giây...',
        );
        // Tạm dừng 2 giây trước khi thử lại
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const existingTopics = await kafkaAdmin.listTopics();

    // Nếu topic chưa tồn tại thì tạo luôn
    if (!existingTopics.includes('order_created')) {
      await kafkaAdmin.createTopics({
        topics: [{ topic: 'order_created', numPartitions: 1 }],
      });
      console.log('✅ Đã tự động khởi tạo Topic: order_created');
    }
    await kafkaAdmin.disconnect();

    // 2. KẾT NỐI PRODUCER (Cũng có thể bọc Try/Catch nếu muốn an toàn tuyệt đối)
    let isClientConnected = false;
    while (!isClientConnected) {
      try {
        await this.kafkaClient.connect();
        isClientConnected = true;
        console.log('✅ Connected to Kafka Producer');
      } catch (error) {
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

  /**
   * Hàm đóng gói đơn hàng và ném vào Kafka
   */
  sendOrderEvent(productId: number, userId: number) {
    const topic = 'order_created';
    const message = {
      productId,
      userId,
      timestamp: new Date().toISOString(),
    };

    // Log ngay tại đây để chắc chắn biết hàm đã được gọi,
    // không phụ thuộc việc Observable có emit `next/complete` hay không.
    console.log(
      `✅ [Kafka] Đã đẩy sự kiện tạo đơn hàng cho User ${userId} vào topic ${topic}`,
    );

    // Hàm emit() hoạt động theo cơ chế "Fire and Forget" (Bắn và Quên)
    // Nghĩa là NestJS ném vào Kafka xong đi làm việc khác luôn, không cần chờ phản hồi
    // [QUAN TRỌNG] Phải có .subscribe() thì NestJS mới thực sự gửi event đi
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
