# Sử dụng Node.js 20 bản Alpine siêu nhẹ
FROM node:20-alpine

# Cài đặt bash hoặc các package cần thiết nếu cần (Alpine thường bị lược bỏ)
# RUN apk add --no-cache bash

# Set thư mục làm việc trong container
WORKDIR /usr/src/app

# Copy package.json và package-lock.json trước để tận dụng Docker Cache
COPY package*.json ./

# Cài đặt dependencies
RUN npm install

# Copy toàn bộ source code vào container
COPY . .

# Build project NestJS
RUN npm run build

# Mở port 3000 để giao tiếp
EXPOSE 3000

# Lệnh chạy app khi container khởi động
# Chạy thẳng file build output để tránh lệch script trong package.json
CMD ["node", "dist/main.js"]