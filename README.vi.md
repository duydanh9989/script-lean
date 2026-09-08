# Script Lean

**Nhanh. Nhẹ. Trang sạch.** Trình chặn quảng cáo siêu nhẹ + công cụ chèn JavaScript cho trình duyệt Chromium — chặn quảng cáo trước khi chúng tải, giúp trang web tải nhanh hơn và không làm phiền bạn.

Ngôn ngữ: [English](README.md) · [Tiếng Việt](README.vi.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

## Vì sao chọn Script Lean

- **Tăng tốc tải trang** — quảng cáo và tracker bị chặn ngay ở lớp mạng *trước khi* chúng kịp tải xuống. Không chạy gì nặng nề trên trang.
- **Siêu nhẹ** — toàn bộ extension chỉ ~80 KB. Không nền dịch vụ nặng, cơ chế dọn quảng cáo tự tắt, dùng rule engine gốc của trình duyệt.
- **Điểm số cao, kiểm chứng được**

  | Bài test | Kết quả |
  |---|---|
  | AdBlockBench | **100%** — Network · Cosmetic · Scriptlet · API |
  | superadblocktest.com | **100%** — chặn 482/482 |
  | adblock.turtlecute.org | **100%** |

- **Web vẫn chạy bình thường** — module **Ads** an toàn tuyệt đối, không đụng vào chức năng trang; các rule rộng hơn nằm riêng ở module **Aggressive** (mặc định tắt). Trang check bot (Cloudflare/DataDome) và trang ngân hàng/thanh toán được bỏ qua hoàn toàn.
- **Khó bị phát hiện** — các API đã vá giữ nguyên "vân tay" gốc; traffic same-site không bao giờ bị động vào, trang web hoạt động như bình thường.
- **8 module bật/tắt một chạm** — Ads · Analytics · Surrogates · Bypass · Anti-Fingerprint · Privacy · Video · Aggressive (mặc định tắt).
- **Filter list tùy chỉnh** — dán URL list bất kỳ, hoặc tự viết rule: `||ads.example.com^` để chặn, `@@||mysite.com^` để cho phép. Áp dụng ngay lập tức, dùng offline được.
- **Chèn JavaScript tùy chỉnh** — inject JS riêng cho từng trang web (theo domain / URL pattern / regex), có lịch chạy tùy chọn. Badge nhỏ hiển thị số script đang chạy; bấm icon **#** trên popup để ẩn.
- **Riêng tư mặc định** — mọi thứ chạy cục bộ trên máy. Không tài khoản, không telemetry, không thu thập dữ liệu.

## Cài đặt (Chrome / Edge / Brave / Chromium) — 1 phút

1. Tải `releases/script-lean-2.5.2.crx`.
2. Mở `chrome://extensions`.
3. Kéo thả file `.crx` vào trang → xác nhận **Add extension**. Xong.
4. Ghim icon → bấm vào → bật tắt module tùy ý.

> Thích dùng bản source? Tải `releases/script-lean-2.5.2.zip` và giải nén (hoặc `git clone` repo này — source chính là extension), bật **Developer mode** → **Load unpacked** → chọn thư mục `script-lean-2.5.2`. Cách này luôn hoạt động, kể cả khi trình duyệt chặn file `.crx` cài ngoài.

Kiểm tra file tải về (MD5):

```
61a00846af9f879462dc39109e09fd94  script-lean-2.5.2.zip
8d5cef567cae9c8e1a2f257c3753a767  script-lean-2.5.2.crx
```

## Lần đầu chạy

- Popup hiển thị trang hiện tại, 8 module, danh sách script và filter list của bạn.
- **Custom JS** cần bật *Allow User Scripts* trên trình duyệt (`chrome://extensions` → Script Lean → Details) — popup sẽ hiện banner hướng dẫn một chạm khi cần. Chặn quảng cáo không cần bước này.
- Còn khung quảng cáo bỏ trống? Module **Ads** đã tự thu gọn các khung rỗng; chỉ bật **Aggressive** nếu trang nào còn sót rác.

## Ảnh chụp màn hình

| AdBlockBench | TurtleCute | SuperAdBlockTest |
|---|---|---|
| ![AdBlockBench 100%](docs/screenshots/adblockbench-100.jpg) | ![TurtleCute 100%](docs/screenshots/turtlecute-100.jpg) | ![SuperAdBlockTest 482/482](docs/screenshots/superadblocktest-100.jpg) |

## Ghi chú

- Giấy phép: [MIT](LICENSE).

## Đọc thêm

**[Where Ads Get Cut](https://duydanh9989.github.io/ad-blocking-intervention-points/)** — Ad blocking trên web thực sự hoạt động thế nào, và nền kinh tế peer mà nó đẩy web tới.
