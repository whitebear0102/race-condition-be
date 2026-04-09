import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RedisStockService } from '../../infrastructure/redis/redis-stock.service';
import type { CreateProductDto } from './dto/create-product.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProductManagementApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisStock: RedisStockService,
  ) {}

  async createProduct(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        productId: uuidv4(),
        name: dto.name ?? null,
        stock: dto.stock,
      },
    });

    await this.redisStock.setStock(product.id, product.stock);

    return product;
  }

  async updateStock(productId: number, stock: number) {
    const existing = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!existing) {
      throw new NotFoundException(`Không tìm thấy sản phẩm id=${productId}`);
    }

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: { stock },
    });

    await this.redisStock.setStock(product.id, product.stock);

    return product;
  }

  async syncRedisFromDatabase(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm id=${productId}`);
    }

    await this.redisStock.setStock(product.id, product.stock);

    return product;
  }
}
