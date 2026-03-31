# 🚀 Hệ Thống Xử Lý Race Condition

Dự án mô phỏng hệ thống bán hàng chớp nhoáng (Flash Sale), giải quyết bài toán tranh chấp tài nguyên (Race Condition) khi có nhiều người dùng cùng tranh mua một số lượng sản phẩm giới hạn trong cùng một thời điểm.

## 🛠 Công Nghệ Sử Dụng

- **Backend:** NestJS (Node.js 20 Alpine)
- **Database & ORM:** MySQL 8.0, Prisma
- **Cache & In-memory DB:** Redis (Xử lý chốt đơn siêu tốc bằng lệnh Atomic)
- **Message Queue:** Apache Kafka (Chạy ở chế độ KRaft, không dùng Zookeeper)
- **Infrastructure:** Docker & Docker Compose
- **Monitoring:** Kafka UI (Provectus)

---

## 🏗 Kiến Trúc Hệ Thống (Hiện Tại)

Hệ thống áp dụng kiến trúc tách biệt luồng xử lý **Đồng bộ (Sync)** và **Bất đồng bộ (Async)** để tối ưu hiệu năng và bảo vệ Database:

1.  **Tiếp nhận (Sync):** NestJS nhận request mua hàng từ người dùng.
2.  **Giữ chỗ (Sync):** NestJS gọi lệnh `DECR` vào Redis. Vì Redis là single-thread, các request được xếp hàng và xử lý nguyên tử (Atomic), chặn đứng hoàn toàn lỗi bán lố (overselling).
3.  **Hàng đợi (Async):** Nếu Redis báo giữ chỗ thành công, NestJS lập tức đẩy sự kiện `order_created` vào Kafka và phản hồi "Thành công" cho người dùng (Độ trễ < 10ms).
4.  **Xử lý hậu cần (Async):** _(Sắp triển khai)_ Kafka Consumer sẽ đọc từ từ các sự kiện này và ghi dữ liệu an toàn xuống MySQL qua Prisma.

---

## 📚 Tóm Tắt Bài Học & Tiến Độ

### Giai đoạn 1: Triển khai Hạ tầng & Giữ chỗ bằng Redis

- Thiết lập môi trường local với `docker-compose` bao gồm MySQL, Redis, Kafka (KRaft mode).
- Chuyển đổi từ TypeORM sang **Prisma** để tối ưu hóa việc quản lý schema và type-safe.
- Xây dựng `RedisService` sử dụng thư viện `ioredis` để nạp tồn kho và gọi lệnh trừ đi 1 (`DECR`).
- Sử dụng `@nestjs/config` và `joi` để validate biến môi trường (Environment variables) chặt chẽ, chuẩn Enterprise.
- **Kết quả:** Vượt qua bài test dùng `fetch` bắn 10 requests cùng 1 mili-giây. Hệ thống chỉ cho phép đúng 5 người mua thành công, 5 người thất bại.

### Giai đoạn 2: Tích hợp Kafka Producer & Xử lý Lỗi Hệ thống

- Tích hợp `@nestjs/microservices` và thiết lập Kafka Client (Producer).
- Bắn thông tin người dùng mua thành công vào topic `order_created`.
- **Xử lý Lỗi Thực Tế:**
  - **Lỗi `ECONNREFUSED` (Startup Race Condition):** NestJS khởi động nhanh hơn Kafka. Đã khắc phục bằng cách thiết lập vòng lặp _Retry_ kết nối sau mỗi 2 giây cho đến khi Kafka Broker mở cổng.
  - **Lỗi `Topic-partition not found`:** Kafka bị ngợp khi tự động tạo topic dưới áp lực của 5 requests cùng lúc. Đã khắc phục bằng cách dùng `Kafka Admin` chủ động tạo sẵn (Pre-create) topic ngay lúc app khởi động.
- Bổ sung **Kafka UI** vào Docker Compose để giám sát trực quan các messages đang chờ trong hàng đợi.

---

## 🚦 Hướng Dẫn Chạy Môi Trường Cục Bộ (Local)

**1. Khởi động hạ tầng Docker:**

```bash
docker-compose up --build -d
```

**2. Chạy kịch bản giả lập Race condition:**

```bash
node test.js
```

**3. Kết quả mong đợi:**

- Terminal của file test in ra: 5 User "Mua THÀNH CÔNG" và 5 User "Rất tiếc, sản phẩm đã bán hết!".
- Terminal của Docker in ra 5 log xác nhận đã đẩy event vào Kafka.
- Trên Kafka UI, topic order_created xuất hiện 5 messages chứa ID đơn hàng.
