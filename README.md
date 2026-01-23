# 🚀 LoS (Local Share) v2.1 - Chia sẻ file P2P

Ứng dụng web PWA mã nguồn mở giúp chia sẻ file tức thì giữa các thiết bị trong mạng LAN qua WebRTC. Không lưu trữ file trên server, bảo mật end-to-end.

> **[Demo](https://share.trchicuong.id.vn/)**

## 📥 Cài đặt

### Yêu cầu

- [Node.js](https://nodejs.org/) phiên bản 18.x trở lên

### Clone Repository

```bash
git clone https://github.com/trchicuong/local-share.git
cd local-share
```

---

## ⚙️ Cấu hình & Chạy

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình môi trường

```bash
# Copy file .env.example
cp .env.example .env
```

**Development mode** (mặc định):

```env
NODE_ENV=development
CORS_ORIGIN=*
VITE_SIGNALING_SERVER_URL=ws://localhost:8080
```

**Production mode** (bắt buộc):

```env
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
VITE_SIGNALING_SERVER_URL=wss://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

⚠️ **Lưu ý Production:**

- KHÔNG sử dụng `CORS_ORIGIN=*` trong production
- Sử dụng WSS (secure WebSocket) thay vì WS
- Cập nhật domain chính xác trong allowedOrigins

### 3. Chạy Development

**Terminal 1 - Server:**

```bash
# Recommended: Với garbage collection
node --expose-gc server.js

# Hoặc
npm start
```

**Terminal 2 - Client:**

```bash
npm run dev
```

### 4. Truy cập

- **Client:** http://localhost:5173
- **Server Health:** http://localhost:8080/health
- **Server Stats:** http://localhost:8080/api/stats

### 5. Build Production

```bash
npm run build
```

---

## 🤝 Đóng góp

Dự án này luôn chào đón các đóng góp! Nếu bạn muốn sửa lỗi, thêm tính năng mới, hoặc cải thiện mã nguồn, hãy thoải mái tạo một `Pull Request`.

---

## ✉️ Liên hệ

Nếu bạn có bất kỳ ý tưởng nào để cải thiện công cụ hoặc phát hiện lỗi, đừng ngần ngại mở một `Issue` trên repo này.

Mọi thông tin khác, bạn có thể liên hệ với tôi qua:
[**trchicuong.id.vn**](https://trchicuong.id.vn/)
