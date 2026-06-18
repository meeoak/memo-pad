# Ara Cinta Indonesia Content Desk

Next.js 기반의 AdSense 승인 준비용 블로그 글 작성/검수/발행 보조 웹앱입니다. 승인을 보장하지 않고, 고유 경험과 정책 리스크를 발행 전에 점검하는 운영 도구입니다.

## 주요 기능

- 한국어 메모를 인도네시아어 경험 중심 글 초안으로 변환
- 글 목적별 구조: 제품 리뷰, 한국 여행 정보, 장소 후기, K-Beauty, K-News
- 원본 경험 점수, 얇은 콘텐츠 위험도, AI 표현 위험도, 정책 위험도 검수
- 이미지 역할 관리, 크기 경고, alt 자동 생성
- WordPress 제목, SEO 제목, 메타 설명, slug, 카테고리, 태그, 본문 HTML 패키지 생성
- WordPress REST API 초안 생성/발행/기존 글 수정, 카테고리/태그 설정, AIOSEO 메타 저장 구조

## 실행

```bash
npm install
npm run dev
```

## 환경변수

`.env.example`을 참고해 `.env.local`을 만드세요.

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
WORDPRESS_BASE_URL=https://example.com
WORDPRESS_USERNAME=
WORDPRESS_APP_PASSWORD=
WORDPRESS_ARCHIVE_CARD_ENDPOINT=
AIOSEO_ENABLED=true
```

API 키가 없어도 로컬 템플릿 초안 생성과 검수 UI는 동작합니다.
