const axios = require('axios');

async function runTest() {
  // 1. Setup 5 sản phẩm vào kho
  await axios.post('http://localhost:3000/race-condition/init/1/5');
  console.log('Đã nạp 5 sản phẩm vào kho!');

  console.log('Bắt đầu mô phỏng 10 người cùng mua 1 lúc...');

  // 2. Tạo ra 10 requests CÙNG LÚC (Promise.all)
  const requests = [];
  for (let i = 1; i <= 10; i++) {
    // Mỗi người mua có 1 userId từ 1 đến 10
    const req = axios
      .post(`http://localhost:3000/race-condition/buy/1/${i}`)
      .then((res) => console.log(`User ${i}: Mua THÀNH CÔNG`))
      .catch((err) => console.log(`User ${i}: ${err.response.data.message}`));
    requests.push(req);
  }

  await Promise.all(requests);
}

runTest();
