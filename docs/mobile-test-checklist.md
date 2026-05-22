# Mobile UI Test Checklist — desktop client (≤768px)

Test trên Chrome DevTools: iPhone SE (375px) và Android (360px).

## Layout & Navigation

- [ ] Sidebar ẩn (width 0) khi load trang
- [ ] Nút hamburger (≡) mở sidebar overlay
- [ ] Tap vào overlay đen đóng sidebar
- [ ] Nav link chọn trang → sidebar tự đóng (*)
- [ ] Topbar cố định, không bị sidebar che
- [ ] Breadcrumb ẩn trên mobile (chỉ hiện title)

> (*) Cần tự đóng sidebar sau khi navigate — chưa implement, cần thêm.

## Login Page

- [ ] Card đăng nhập vừa màn hình, không bị cắt
- [ ] Input username/password dùng được
- [ ] Nút đăng nhập full-width

## Dashboard

- [ ] KPI cards: 2 cột (375px) / 1 cột (320px)
- [ ] Shift bar wrap gọn, không tràn ngang
- [ ] Peak banner không có separator dọc, wrap đúng
- [ ] Biểu đồ công suất hiển thị đủ
- [ ] Filter (khu vực / thiết bị / range) dùng được trong topbar
- [ ] Danh sách thiết bị scroll được
- [ ] Alert list scroll được
- [ ] Device modal: max-width calc(100vw - 24px), không bị cắt
- [ ] Nút "Xem phân tích chi tiết" trong modal dùng được

## Report Page

- [ ] Period tabs không tràn ngang
- [ ] Bảng data có overflow-x: auto (scroll ngang)
- [ ] KPI strip wrap đúng

## Analysis Page

- [ ] Charts grid 1 cột trên mobile
- [ ] Heatmap scroll ngang (min-width: 760px trong scroll container)
- [ ] Grid 2:1 → 1 cột

## Alerts Page

- [ ] Filter bar wrap đúng
- [ ] Alert rows readable
- [ ] Resolve button dùng được

## Devices Page (Admin)

- [ ] KPI strip wrap
- [ ] Table có horizontal scroll
- [ ] Modal add/edit device full-width

## Topology Page

- [ ] Tab navigation dùng được
- [ ] Flow diagram scroll được (overflow: auto)
- [ ] Detail panel (320px wide) không che khuất nội dung khi open

## Users / Activity / API Keys (Admin)

- [ ] Table có horizontal scroll
- [ ] Filter bar wrap
- [ ] Modal full-width

## Bugs đã biết / chưa fix

| # | Vấn đề | File |
|---|--------|------|
| 1 | Sidebar không tự đóng sau khi click nav link | Layout.tsx |
| 2 | Topbar right có thể overflow nếu filter nhiều option | DashboardPage.tsx |
| 3 | Clock và status-live bị ẩn trên mobile (trade-off) | index.css |
