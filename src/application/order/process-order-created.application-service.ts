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
  async handle(data: {
    productId: number;
    userId: number;
    timestamp: string;
    idempotencyKey: string;
  }) {
    const { productId, userId, idempotencyKey } = data;

    // ==========================================
    // 1. CHỐNG LẶP DO MẠNG (NETWORK IDEMPOTENCY)
    // ==========================================
    const existingKey = await this.prisma.order.findUnique({
      where: { idempotencyKey: idempotencyKey },
    });

    if (existingKey) {
      console.log(`⚠️ Bỏ qua tin nhắn lặp do mạng (Key: ${idempotencyKey})`);
      return; // Kafka auto-commit
    }

    // ==========================================
    // 2. LUẬT KINH DOANH (BUSINESS RULE)
    // ==========================================
    // Kiểm tra xem User này có đang ôm đơn nào PENDING hoặc CONFIRMED không?
    const activeOrder = await this.prisma.order.findFirst({
      where: {
        productId: productId,
        userId: userId,
        status: { in: ['PENDING', 'CONFIRMED'] }, // Cấm mua thêm nếu đơn cũ đang chờ hoặc đã xong
      },
    });

    if (activeOrder) {
      console.log(
        `⚠️ User ${userId} đang có đơn hàng PENDING/CONFIRMED. Không được mua thêm.`,
      );
      // Tùy nghiệp vụ: Bạn có thể return luôn, HOẶC phải cộng lại +1 stock vào Redis ở bước này
      // vì Redis đã lỡ trừ đi ở Controller rồi.
      return;
    }

    // ==========================================
    // 3. XỬ LÝ LƯU ĐƠN NHƯ BÌNH THƯỜNG
    // ==========================================
    try {
      await this.prisma.$transaction([
        this.prisma.order.create({
          data: {
            productId,
            userId,
            idempotencyKey, // Lưu khóa này vào DB
          },
        }),
        this.prisma.product.update({
          where: { id: productId },
          data: { stock: { decrement: 1 } },
        }),
      ]);
    } catch (err: any) {
      if (err.code === 'P2002') return; // Cú chốt chặn DB (nếu 2 luồng lọt qua cùng lúc)
      throw err; // Lỗi DB sập, throw để Kafka gửi lại
    }
  }
}
