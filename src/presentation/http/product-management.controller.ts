import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ProductManagementApplicationService } from '../../application/product/product-management.application-service';
import { CreateProductDto } from '../../application/product/dto/create-product.dto';
import { UpdateProductStockDto } from '../../application/product/dto/update-product-stock.dto';

@Controller('race-condition/management/products')
export class ProductManagementController {
  constructor(
    private readonly productManagement: ProductManagementApplicationService,
  ) {}

  @Post()
  async createProduct(@Body() body: CreateProductDto) {
    const product = await this.productManagement.createProduct(body);
    return {
      message: 'Đã tạo sản phẩm và sync tồn kho lên Redis.',
      product,
    };
  }

  @Patch(':id/stock')
  async updateStock(
    @Param('id') id: string,
    @Body() body: UpdateProductStockDto,
  ) {
    const product = await this.productManagement.updateStock(+id, body.stock);
    return {
      message: `Đã cập nhật tồn kho và sync Redis cho sản phẩm id=${id}.`,
      product,
    };
  }
}
