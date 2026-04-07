import { Controller, Param, Post } from '@nestjs/common';
import { PlaceOrderApplicationService } from '../../application/order/place-order.application-service';

@Controller('race-condition/orders')
export class OrderController {
  constructor(private readonly placeOrder: PlaceOrderApplicationService) {}

  @Post('buy/:productId/:userId')
  async buyProduct(
    @Param('productId') productId: string,
    @Param('userId') userId: string,
  ) {
    return this.placeOrder.placeOrder(+productId, +userId);
  }
}
