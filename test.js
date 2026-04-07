const axios = require('axios');

async function runTest() {
  // 1. Tạo product qua API management (DB + sync Redis)
  const createRes = await axios.post(
    'http://localhost:3000/race-condition/management/products',
    {
      name: 'Harry Potter - Chiếc cốc lửa',
      stock: 5,
    },
  );

  const productId = createRes.data?.product?.id;
  if (!productId) {
    throw new Error(
      `Không lấy được productId từ response: ${JSON.stringify(createRes.data)}`,
    );
  }

  console.log(`Đã tạo product id=${productId} với stock=5 (đã sync Redis)`);

  console.log('Bắt đầu mô phỏng 10 người cùng mua 1 lúc...');

  // 2. Tạo ra 10 requests CÙNG LÚC (Promise.all)
  const requests = [];
  for (let i = 1; i <= 10; i++) {
    // Mỗi người mua có 1 userId từ 1 đến 10
    const req = axios
      .post(`http://localhost:3000/race-condition/orders/buy/${productId}/${i}`)
      .then(() => console.log(`User ${i}: Mua THÀNH CÔNG`))
      .catch((err) =>
        console.log(
          `User ${i}: ${
            err?.response?.data?.message ?? err?.message ?? 'Unknown error'
          }`,
        ),
      );
    requests.push(req);
  }

  await Promise.all(requests);
}

runTest();
