import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

export type OrderCreatedEvent = {
  productId: number;
  userId: number;
  timestamp?: string;
};

@Injectable()
export class ProcessOrderCreatedApplicationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Xử lý event `order_created` từ Kafka.
   * - Trừ tồn kho trong DB (atomic).
   * - Tạo Order record để audit.
   */
  async handle(event: OrderCreatedEvent) {
    const { productId, userId } = event;

    const updated = await this.prisma.product.updateMany({
      where: { id: productId, stock: { gt: 0 } },
      data: { stock: { decrement: 1 } },
    });

    if (updated.count === 0) {
      await this.prisma.order.create({
        data: {
          productId,
          userId,
          status: OrderStatus.FAILED,
        },
      });
      return { ok: false as const };
    }

    await this.prisma.order.create({
      data: {
        productId,
        userId,
        status: OrderStatus.CONFIRMED,
      },
    });

    return { ok: true as const };
  }
}

