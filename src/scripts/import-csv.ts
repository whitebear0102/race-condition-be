import 'dotenv/config';
import * as fs from 'fs';
import csv from 'csv-parser';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// -----------------------------------------------------------------------------
// 1. CẤU HÌNH PRISMA CLIENT ĐỘC LẬP (KHÔNG DÙNG NESTJS CONFIG)
// -----------------------------------------------------------------------------
function createScriptPrismaClient(): PrismaClient {
  const url =
    process.env.DATABASE_URL ||
    'mysql://root:root_password@localhost:3306/race_condition_db';
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set (load .env or export it before running)',
    );
  }

  const parsedUrl = new URL(url);

  // Khởi tạo trực tiếp bằng object cấu hình
  const adapter = new PrismaMariaDb({
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port) || 3306,
    user: parsedUrl.username,
    password: parsedUrl.password,
    database: parsedUrl.pathname.slice(1),
    connectionLimit: 50, // Tăng pool lên 50 để chạy batch mượt mà
    connectTimeout: 20000, // Thêm timeout 20s để chống sập khi DB bị nghẽn
  });

  return new PrismaClient({ adapter });
}

const prisma = createScriptPrismaClient();

// Hàm hỗ trợ tạo độ trễ ngẫu nhiên (Jitter) để chống "đụng xe" liên hoàn (Deadlock)
const sleepWithJitter = (baseMs: number) => {
  const randomJitter = Math.floor(Math.random() * 500); // Ngẫu nhiên 0-500ms
  return new Promise((resolve) => setTimeout(resolve, baseMs + randomJitter));
};

// -----------------------------------------------------------------------------
// 2. LOGIC ĐỌC FILE VÀ XỬ LÝ BATCH
// -----------------------------------------------------------------------------
async function importCsvFile(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n[INFO] BẮT ĐẦU ĐỌC FILE: ${filePath}\n`);
    const totalStartTime = Date.now();

    let batch: any[] = [];
    const promises: Promise<any>[] = [];

    // HẠ THÔNG SỐ XUỐNG MỨC AN TOÀN TUYỆT ĐỐI
    const BATCH_SIZE = 2500;
    const MAX_CONCURRENT_INSERTS = 5;

    const stream = fs.createReadStream(filePath).pipe(csv());

    let totalInserted = 0;
    let batchCounter = 0;

    // MẢNG LƯU TRỮ CÁC BATCH LỖI KHÔNG THỂ PHỤC HỒI KỂ CẢ BẰNG FALLBACK
    const failedBatchIds: number[] = [];

    // --- HÀM THỰC THI INSERT KÈM AUTO-RETRY, JITTER VÀ FALLBACK ---
    const executeInsertWithRetry = async (
      dataBatch: any[],
      batchId: number,
      retryCount = 5, // Tăng số lần thử lên 5 lần
    ) => {
      // BÍ KÍP 1: Sắp xếp mảng theo ProductId trước khi insert để DB xếp hàng theo một chiều, giảm 99% Deadlock.
      dataBatch.sort((a, b) =>
        String(a.productId).localeCompare(String(b.productId)),
      );

      let attempt = 1;

      while (attempt <= retryCount) {
        try {
          const result = await prisma.product.createMany({
            data: dataBatch,
            skipDuplicates: true, // Bỏ qua nếu trùng lặp
          });
          return result; // Thành công -> Thoát ngay vòng lặp
        } catch (error: any) {
          if (error.code === 'P2034' && attempt < retryCount) {
            console.log(
              `[WARNING] Batch #${batchId} Deadlock. Lùi lại ngẫu nhiên và thử lần ${attempt + 1}...`,
            );

            // BÍ KÍP 2: Ngủ với thời gian ngẫu nhiên (Jitter)
            await sleepWithJitter(500 * attempt);
            attempt++;
          } else if (attempt === retryCount || error.code !== 'P2034') {
            // BÍ KÍP 3: FALLBACK - LƯỚI AN TOÀN CUỐI CÙNG
            console.log(
              `[CRITICAL] Batch #${batchId} kẹt nặng. KÍCH HOẠT FALLBACK: Chèn tuần tự từng record...`,
            );

            let fallbackSuccessCount = 0;
            let fallbackFailCount = 0;

            // Chạy tuần tự từng dòng (chậm nhưng chắc chắn 100% không đụng độ)
            for (const row of dataBatch) {
              try {
                await prisma.product.create({
                  data: row,
                });
                fallbackSuccessCount++;
              } catch (singleRowErr: any) {
                // Nếu lỗi trùng lặp (P2002) thì bỏ qua bình thường, coi như không tính.
                // Nếu lỗi khác (ví dụ sai kiểu dữ liệu), ghi nhận là fail
                if (singleRowErr.code !== 'P2002') {
                  fallbackFailCount++;
                }
              }
            }

            console.log(
              `[RECOVERED] Batch #${batchId} đã khôi phục bằng Fallback. Cứu được: ${fallbackSuccessCount} records. Bỏ qua do lỗi cứng: ${fallbackFailCount}`,
            );

            // Nếu cả Fallback cũng thất bại hoàn toàn (không cứu được dòng nào và data > 0)
            if (fallbackSuccessCount === 0 && dataBatch.length > 0) {
              throw new Error('Fallback failed entirely.');
            }

            // Trả về số lượng record thực tế cứu được để cộng vào tổng
            return { count: fallbackSuccessCount };
          }
        }
      }
    };

    stream.on('data', async (row) => {
      // 1. MAP DỮ LIỆU
      batch.push({
        productId: row['Id'],
        name: row['Title'],
        stock: 0,
      });

      // 2. Gom đủ batch thì đẩy vào DB
      if (batch.length >= BATCH_SIZE) {
        stream.pause(); // Cầm chân luồng đọc, tránh tràn RAM

        const currentBatch = [...batch];
        batch = [];

        batchCounter++;
        const currentBatchId = batchCounter;
        const batchStartTime = Date.now();

        // Dùng hàm Retry Tối Thượng để xử lý Insert
        const insertPromise = executeInsertWithRetry(
          currentBatch,
          currentBatchId,
        )
          .then((result: any) => {
            totalInserted += result.count;
            const batchDuration = Date.now() - batchStartTime;
            console.log(
              `[Batch #${currentBatchId}] Chèn ${result.count} records | Tốn: ${batchDuration}ms | Tổng đã chèn: ${totalInserted}`,
            );
          })
          .catch((err) => {
            console.error(
              `[ERROR] Xảy ra thảm họa, Batch #${currentBatchId} MẤT HOÀN TOÀN:`,
              err.message || err,
            );
            // Ghi nhận ID batch chết cứng vào sổ Nam Tào
            failedBatchIds.push(currentBatchId);
          })
          .finally(() => {
            promises.splice(promises.indexOf(insertPromise), 1);
          });

        promises.push(insertPromise);

        // 3. Kiểm soát luồng song song
        if (promises.length >= MAX_CONCURRENT_INSERTS) {
          await Promise.race(promises);
        }

        stream.resume(); // Đọc tiếp file
      }
    });

    stream.on('end', async () => {
      // 4. Xử lý lô dữ liệu cuối cùng
      if (batch.length > 0) {
        batchCounter++;
        const batchStartTime = Date.now();

        try {
          const result: any = await executeInsertWithRetry(batch, batchCounter);
          totalInserted += result.count;
          const batchDuration = Date.now() - batchStartTime;
          console.log(
            `[Batch #${batchCounter} (Cuối)] Chèn ${result.count} records | Tốn: ${batchDuration}ms | Tổng đã chèn: ${totalInserted}`,
          );
        } catch (err: any) {
          console.error(`[ERROR] Lỗi ở Batch cuối cùng:`, err.message || err);
          failedBatchIds.push(batchCounter);
        }
      }

      // 5. Đợi các luồng dở dang chạy xong
      await Promise.all(promises);

      // Thống kê kết quả
      const totalEndTime = Date.now();
      const totalDurationSecs = (
        (totalEndTime - totalStartTime) /
        1000
      ).toFixed(2);

      console.log('\n==================================================');
      console.log(`🎉 THỐNG KÊ IMPORT HOÀN TẤT 🎉`);
      console.log(`- Tổng số records đã chèn : ${totalInserted}`);
      console.log(`- Tổng số batch đã chạy   : ${batchCounter}`);
      console.log(`- Tổng số batch thất bại  : ${failedBatchIds.length}`);

      if (failedBatchIds.length > 0) {
        console.log(`  -> Các batch CHẾT CỨNG: [${failedBatchIds.join(', ')}]`);
        console.log(
          `  *(Hãy kiểm tra lại dữ liệu thô trong khoảng dòng tương ứng)*`,
        );
      }

      console.log(`- Tổng thời gian chạy     : ${totalDurationSecs} giây`);
      console.log('==================================================\n');

      resolve();
    });

    stream.on('error', (error) => {
      console.error('[FATAL] Lỗi đọc file CSV:', error);
      reject(error);
    });
  });
}

// -----------------------------------------------------------------------------
// 3. KHỐI KHỞI CHẠY (ENTRY POINT)
// -----------------------------------------------------------------------------
const args = process.argv.slice(2);
const inputFile = args[0] || 'data/optimize_books.csv';

importCsvFile(inputFile)
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[SYSTEM] Script bị gián đoạn:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
