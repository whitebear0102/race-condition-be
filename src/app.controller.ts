import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';
import { RedisService } from './redis.service';
import { KafkaService } from './kafka.service';

@Controller('race-condition')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly redisService: RedisService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // 1. Khởi tạo: Đưa 5 sản phẩm lên Redis
  @Post('init/:productId/:stock')
  async initSale(
    @Param('productId') productId: string,
    @Param('stock') stock: string,
  ) {
    await this.redisService.initStock(+productId, +stock);
    return {
      message: `Đã nạp ${stock} sản phẩm ID ${productId} vào Redis để sẵn sàng mở bán!`,
    };
  }

  // 2. Nút Mua hàng: Nơi 10 người sẽ cùng bấm vào
  @Post('buy/:productId/:userId')
  async buyProduct(
    @Param('productId') productId: string,
    @Param('userId') userId: string,
  ) {
    // 1. Phễu chặn Race Condition bằng Redis
    const isSuccess = await this.redisService.reserveProduct(+productId);

    if (isSuccess) {
      // 2. [MỚI] Ném dữ liệu vào Kafka để xử lý hậu cần
      this.kafkaService.sendOrderEvent(+productId, +userId);

      return {
        status: 'success',
        message: 'Bạn đã giữ chỗ thành công! Đơn hàng đang được xử lý.',
      };
    } else {
      throw new BadRequestException({
        status: 'failed',
        message: 'Rất tiếc, sản phẩm đã bán hết!',
      });
    }
  }
}
