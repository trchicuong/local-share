# Local Share (LoS) v3.1 - Chia sẻ file P2P

Ứng dụng web (PWA) chia sẻ tập tin và tin nhắn tức thì qua giao thức WebRTC P2P trong mạng nội bộ (LAN / Wi-Fi) hoặc liên mạng, hoạt động trực tiếp trên trình duyệt đa nền tảng (Windows, macOS, Linux, iOS, Android).

---

## Tính năng cốt lõi

- **Mã hóa đầu-cuối P2P**: Dữ liệu truyền trực tiếp giữa hai thiết bị qua WebRTC DataChannel (chuẩn mã hóa DTLS-SRTP). Máy chủ chỉ làm nhiệm vụ kết nối tín hiệu (Signaling), tuyệt đối không lưu trữ dữ liệu.
- **Tự động nhận diện (LAN Discovery)**: Tự động phát hiện các thiết bị trong cùng mạng Wi-Fi hoặc Subnet IP nội bộ mà không cần cài đặt hay đăng nhập.
- **Ghép đôi thiết bị & Phòng công khai**: Hỗ trợ ghép đôi vĩnh viễn qua mã PIN 6 số hoặc tham gia phòng công khai để chia sẻ tập tin qua Internet hoặc giữa các mạng khác nhau.
- **Tối ưu hóa thiết bị di động (Mobile First)**: Tích hợp Web Share API cho phép chọn vị trí lưu qua hộp thoại "Lưu vào Tệp" trên iOS Safari; tự động đóng gói file ZIP khi chuyển nhiều tập tin.
- **Truyền luồng Zero-RAM**: Sử dụng File System Access API và cơ chế kiểm soát dòng chảy (Backpressure Partition ACK) giúp truyền tập tin dung lượng lớn mà không gây tràn bộ nhớ RAM.
- **Dự phòng WebSocket Relay**: Tự động chuyển hướng dữ liệu qua WebSocket khi môi trường mạng chặn WebRTC P2P (mạng 4G/5G hoặc tường lửa doanh nghiệp).
- **Giao diện tối giản**: Phong cách radar đen tuyền trực quan, hỗ trợ chuyển đổi chế độ Radar / Lưới và song ngữ (Tiếng Anh mặc định, Tiếng Việt).
- **Chuẩn PWA & Web Share Target**: Hỗ trợ cài đặt như ứng dụng native, tích hợp vào menu chia sẻ hệ thống của thiết bị và hoạt động ngoại tuyến khi mạng LAN không có Internet.

---

## Cấu trúc thư mục

- `client/`: Mã nguồn giao diện người dùng (Vite, Vanilla JavaScript ES Modules, Service Worker, PWA).
- `server/`: Máy chủ tín hiệu WebSocket và HTTP tĩnh (Node.js ESM, Express).
- `docker/`: Dockerfile tối ưu đa tầng (Multi-Stage Build) và tệp cấu hình Docker Compose.

---

## Hướng dẫn cài đặt và vận hành

### 1. Cài đặt thư viện

Yêu cầu Node.js phiên bản 18 trở lên:

```bash
npm run install:all
```

### 2. Chạy môi trường phát triển (Development)

Khởi chạy song song máy chủ backend và frontend với tính năng hot-reload:

```bash
# Terminal 1: Chạy máy chủ Signaling (Cổng mặc định: 3000)
npm run dev:server

# Terminal 2: Chạy Vite Dev Server (Cổng mặc định: 5173)
npm run dev
```

### 3. Đóng gói và chạy môi trường thực tế (Production)

```bash
# Đóng gói frontend PWA vào client/dist/
npm run build

# Khởi chạy dịch vụ hoàn chỉnh trên cổng 3000
npm start
```

Truy cập ứng dụng tại `http://localhost:3000` hoặc địa chỉ IP mạng nội bộ của bạn.

---

## Triển khai bằng Docker

Ứng dụng được đóng gói sẵn hình ảnh Node.js 22 Alpine đa kiến trúc (`amd64` và `arm64`).

### Khởi chạy với Docker Compose

```bash
cd docker
docker compose up -d --build
```

Kiểm tra trạng thái dịch vụ:

```bash
docker compose ps
docker compose logs -f
```

### Khởi chạy kèm Caddy Reverse Proxy (Tự động cấp chứng chỉ SSL nội bộ)

```bash
cd docker
docker compose -f docker-compose.caddy.yml up -d --build
```

---

## Cấu hình cổng và biến môi trường

Hệ thống hoạt động với các giá trị mặc định tối ưu (Zero-Config). Khi cần thay đổi cổng hoặc máy chủ STUN/TURN, sao chép tệp mẫu sang `.env`:

```bash
cp .env.example .env
```

### Các thông số chính:

- `PORT`: Cổng máy chủ HTTP và WebSocket (mặc định: `3000`).
- `HOST`: Địa chỉ lắng nghe (mặc định: `0.0.0.0`).
- `NODE_ENV`: Chế độ thực thi (`production` hoặc `development`).
- `WS_FALLBACK`: Bật/tắt chế độ dự phòng truyền qua WebSocket (mặc định: `true`).
- `RATE_LIMIT`: Bật/tắt bảo vệ chống spam kết nối (mặc định: `true`).
- `RTC_CONFIG`: Cấu hình danh sách máy chủ STUN/TURN tùy chỉnh (JSON).

_Lưu ý về cổng:_ Hệ thống sử dụng cổng `3000` (hoặc cổng `80`/`443` nếu dùng Caddy).

---

## Credits

- Tham khảo & ý tưởng của [PairDrop](https://github.com/schlagmichdoch/PairDrop).

---

## Đóng góp

Dự án này luôn chào đón các đóng góp! Nếu bạn muốn sửa lỗi, thêm tính năng mới, hoặc cải thiện mã nguồn, hãy thoải mái tạo một `Pull Request`.

---

## Liên hệ

Nếu bạn có bất kỳ ý tưởng nào để cải thiện công cụ hoặc phát hiện lỗi, đừng ngần ngại mở một `Issue` trên repo này.

Mọi thông tin khác, bạn có thể liên hệ với tôi qua:
[**trchicuong.id.vn**](https://trchicuong.id.vn/)
