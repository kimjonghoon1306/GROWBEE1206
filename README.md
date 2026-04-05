# GROW BEE 체험단 플랫폼 v2

## 📁 파일 트리

```
growby_v2/
├── index.html                        ← 메인 홈페이지
├── assets/
│   └── css/
│       └── design-system.css         ← 디자인 시스템 (CSS 변수, 공통)
├── components/                       ← 공통 컴포넌트 참조용
└── pages/
    ├── user/                         ← 사용자 페이지
    │   ├── campaigns.html            ← 체험단 목록
    │   ├── campaign-detail.html      ← 캠페인 상세
    │   ├── regions.html              ← 지역별
    │   ├── categories.html           ← 카테고리별
    │   ├── review.html               ← 리뷰 현황
    │   ├── notice.html               ← 공지사항
    │   ├── advertiser.html           ← 광고주(사장님)
    │   ├── login.html                ← 로그인
    │   ├── signup.html               ← 회원가입
    │   ├── mypage.html               ← 마이페이지
    │   ├── faq.html                  ← FAQ
    │   └── contact.html              ← 1:1 문의
    └── admin/                        ← 관리자 페이지
        ├── admin-dashboard.html      ← 대시보드
        ├── admin-campaigns.html      ← 캠페인 관리
        └── admin-members.html        ← 회원 관리
```

## 🎨 디자인 커스터마이징

`assets/css/design-system.css` 상단 `:root` 변수 수정으로 전체 색상 변경.

### 낮/밤 모드
- **기본(낮)**: 노란 배경 (`#F5E642`)
- **밤**: 다크 배경 (`#0D0D0D`)
- 헤더 `☀️/🌙` 버튼으로 전환, `localStorage`에 저장됨

### 브랜드 색상
- Primary: `#FF4757` (레드)
- Secondary: `#2ED573` (그린)
- Accent: `#FFA502` (오렌지)

## 🔑 접근

- 홈: `index.html`
- 관리자: 우측 상단 ⚙️ 또는 `pages/admin/admin-dashboard.html`
