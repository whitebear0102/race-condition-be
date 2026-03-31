import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  // 1. Inject ConfigService thông qua constructor
  constructor(private configService: ConfigService) {}

  // Tự động kết nối Redis khi NestJS khởi động
  onModuleInit() {
    // 2. Lấy giá trị cực kỳ an toàn và sạch sẽ
    // Không còn nỗi lo 'undefined' hay phải parseInt() nữa
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');

    this.redisClient = new Redis({
      host: host,
      port: port,
    });

    console.log(`✅ Connected to Redis at ${host}:${port}`);
  }

  // Đóng kết nối khi app tắt
  onModuleDestroy() {
    this.redisClient.quit();
  }

  /**
   * HÀM QUAN TRỌNG NHẤT: Giữ chỗ sản phẩm
   * Sử dụng lệnh DECR (Decrement) của Redis để trừ đi 1.
   * Do Redis là Single-thread, lệnh này là Atomic -> Không bao giờ bị Race Condition.
   */
  async reserveProduct(productId: number): Promise<boolean> {
    const key = `product:${productId}:stock`;

    // Trừ số lượng tồn kho đi 1 và trả về kết quả sau khi trừ
    const currentStock = await this.redisClient.decr(key);

    if (currentStock >= 0) {
      // Kho vẫn còn (từ 0 trở lên) -> Giữ chỗ thành công
      return true;
    } else {
      // Nếu số âm (< 0) -> Đã hết hàng.
      // (Tùy chọn: Cộng lại 1 để giữ cho số lượng không bị âm vô cực)
      // await this.redisClient.incr(key);
      return false;
    }
  }

  // Hàm phụ để Setup tồn kho ban đầu trước khi mở bán
  async initStock(productId: number, stock: number): Promise<void> {
    const key = `product:${productId}:stock`;
    await this.redisClient.set(key, stock);
  }
}
