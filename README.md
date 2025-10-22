# 🚀 LoS (Local Share) v2.0 - Chia sẻ file tức thì!

Một ứng dụng web PWA mã nguồn mở giúp chia sẻ file tức thì giữa các thiết bị trong cùng mạng Wi-Fi/LAN. Không lưu trữ file trên server, bảo mật, đa nền tảng.

> **[Xem Demo trực tiếp](https://share.trchicuong.id.vn/)**

## ✨ Tính năng mới v2.0

- 🔒 **Bảo mật nâng cao**: Rate limiting, input validation, secure ID generation
- ⚡ **Hiệu năng cao**: O(1) lookups, WebSocket compression (70-80% bandwidth)
- 📊 **Monitoring**: Health checks, structured logging, stats API
- 🛡️ **Production ready**: Helmet security headers, graceful shutdown, error handling

---

### 📥 Tải về

**1. Yêu cầu:**

- Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 18.x trở lên).

**2. Clone từ GitHub:**

```bash
git clone https://github.com/trchicuong/local-share.git
cd local-share
```

Hoặc tải file `.zip` trực tiếp từ repository.

---

### ⚙️ Cài đặt & Chạy

1. **Cài đặt các gói phụ thuộc:**

   ```bash
   npm install
   ```

   Dependencies chính:

   - `helmet` - Security headers
   - `express-rate-limit` - Rate limiting
   - `nanoid` - Secure ID generation

2. **Tạo file cấu hình môi trường:**

   - Đổi tên file `.env.example` thành `.env` ở thư mục gốc
   - Chỉnh sửa các biến nếu cần

3. **Chạy server websocket:**

   ```bash
   npm start
   ```

4. **Chạy server phát triển:**

   ```bash
   npm run dev
   ```

   > **[*] Lưu ý: Cần chạy song song ở 2 cửa sổ/Tab terminal khác nhau**

5. **Truy cập trình duyệt:**

   - Client: `http://localhost:5173`
   - Server health: `http://localhost:8080/health`
   - Server stats: `http://localhost:8080/api/stats`

6. **Build dự án (client):**
   ```bash
   npm run build
   ```

---

### 🔒 Cấu hình Bảo mật (v2.0)

Thêm vào file `.env`:

```env
NODE_ENV=production
MAX_CONNECTIONS=100
MAX_MESSAGE_SIZE=1048576
```

**Giới hạn mặc định:**

- Rate limit HTTP: 100 requests/15 phút
- Rate limit WebSocket: 50 messages/10 giây
- Max connections: 100
- Max message size: 1MB

---

### 📁 Cấu trúc thư mục

```
local-share/
├── public/
│   ├── images/
│   └── manifest.json
├── src/
│   ├── config.js
│   ├── main.js
│   ├── style.css
│   └── vanta-init.js
├── .env.example
├── .gitignore
├── index.html
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
├── server.js
└── vite.config.js
```

---

### 🤝 Đóng góp

Dự án này luôn chào đón các đóng góp! Nếu bạn muốn sửa lỗi, thêm tính năng mới, hoặc cải thiện mã nguồn, hãy thoải mái tạo một `Pull Request`.

---

### ✉️ Góp ý & Liên hệ

Nếu bạn có bất kỳ ý tưởng nào để cải thiện công cụ hoặc phát hiện lỗi, đừng ngần ngại mở một `Issue` trên repo này.

Mọi thông tin khác, bạn có thể liên hệ với tôi qua:
[**trchicuong.id.vn**](https://trchicuong.id.vn/)
