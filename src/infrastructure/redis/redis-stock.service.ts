import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisStockService implements OnModuleInit, OnModuleDestroy {
  private redisClient: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');

    this.redisClient = new Redis({
      host: host,
      port: port,
    });

    console.log(`✅ Connected to Redis at ${host}:${port}`);
  }

  onModuleDestroy() {
    this.redisClient.quit();
  }

  /**
   * Giữ chỗ 1 đơn vị tồn kho (atomic DECR).
   */
  async reserveProduct(productId: number): Promise<boolean> {
    const key = this.stockKey(productId);
    const currentStock = await this.redisClient.decr(key);

    if (currentStock >= 0) {
      return true;
    }

    return false;
  }

  /**
   * Ghi đè tồn kho trên Redis (đồng bộ từ DB hoặc khởi tạo).
   */
  async setStock(productId: number, stock: number): Promise<void> {
    const key = this.stockKey(productId);
    await this.redisClient.set(key, stock);
  }

  private stockKey(productId: number): string {
    return `product:${productId}:stock`;
  }
}
