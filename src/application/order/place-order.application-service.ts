import { BadRequestException, Injectable } from '@nestjs/common';
import { KafkaService } from '../../infrastructure/kafka/kafka.service';
import { RedisStockService } from '../../infrastructure/redis/redis-stock.service';

@Injectable()
export class PlaceOrderApplicationService {
  constructor(
    private readonly redisStock: RedisStockService,
    private readonly kafka: KafkaService,
  ) {}

  async placeOrder(productId: number, userId: number, idempotencyKey: string) {
    const reserved = await this.redisStock.reserveProduct(productId);

    if (!reserved) {
      throw new BadRequestException({
        status: 'failed',
        message: 'Rất tiếc, sản phẩm đã bán hết!',
      });
    }

    this.kafka.sendOrderEvent(productId, userId, idempotencyKey);

    return {
      status: 'success',
      message: 'Bạn đã giữ chỗ thành công! Đơn hàng đang được xử lý.',
    };
  }
}
