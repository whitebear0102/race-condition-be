import * as fs from 'fs';
import csv from 'csv-parser';
import { format } from '@fast-csv/format';

async function removeColumnsAndCreateNewCsv(
  inputFilePath: string,
  outputFilePath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[INFO] Bắt đầu xử lý file: ${inputFilePath}`);

    // 1. Tạo Stream đọc file gốc
    const readStream = fs.createReadStream(inputFilePath).pipe(csv());

    // 2. Tạo Stream ghi file mới
    const writeStream = fs.createWriteStream(outputFilePath);

    // 3. Khởi tạo cấu hình ghi CSV (chỉ giữ 2 cột headers này)
    const csvWriteStream = format({ headers: ['Id', 'Title'] });

    // Kết nối định dạng CSV vào file đích
    csvWriteStream.pipe(writeStream);

    let processedCount = 0;

    readStream.on('data', (row) => {
      // Chỉ trích xuất 2 cột cần thiết
      const cleanedRow = {
        Id: row['Id'],
        Title: row['Title'],
      };

      // Đẩy dòng dữ liệu đã lọc vào file mới
      const canWrite = csvWriteStream.write(cleanedRow);

      // Cơ chế backpressure để tránh tràn RAM
      if (!canWrite) {
        readStream.pause();
        csvWriteStream.once('drain', () => readStream.resume());
      }

      processedCount++;
      if (processedCount % 100000 === 0) {
        console.log(`[INFO] Đã làm sạch và ghi: ${processedCount} dòng...`);
      }
    });

    readStream.on('end', () => {
      // Đóng luồng ghi CSV khi đã đọc xong
      csvWriteStream.end();
    });

    readStream.on('error', (err) => {
      console.error('[ERROR] Lỗi khi đọc file', err);
      reject(err);
    });

    // Lắng nghe sự kiện finish của writeStream
    writeStream.on('finish', () => {
      console.log(
        `[SUCCESS] 🎉 Hoàn tất! File dữ liệu mới đã được lưu tại: ${outputFilePath}`,
      );
      resolve();
    });

    writeStream.on('error', (err) => {
      console.error('[ERROR] Lỗi khi ghi file', err);
      reject(err);
    });
  });
}

// --- PHẦN THỰC THI SCRIPT ---

// Lấy tham số truyền vào từ dòng lệnh (Terminal)
const args = process.argv.slice(2);

// Tham số 1: File nguồn (Mặc định: input.csv)
const inputFile = args[0] || 'input.csv';

// Tham số 2: File đích (Mặc định: cleaned_data.csv)
const outputFile = args[1] || 'cleaned_data.csv';

// Khởi chạy
removeColumnsAndCreateNewCsv(inputFile, outputFile)
  .then(() => {
    process.exit(0); // Thoát chương trình thành công
  })
  .catch((error) => {
    console.error('[FATAL] Script thất bại:', error);
    process.exit(1); // Thoát chương trình với mã lỗi
  });
