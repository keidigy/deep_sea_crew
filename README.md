# Deep Sea Crew

온라인 협력 트릭테이킹 보드게임 프로토타입입니다. 현재는 하나의 Node.js 서비스가 방과 게임 상태를 메모리에 보관합니다.

## Local run

```bash
npm start
```

테스트는 `npm test`로 실행합니다. 상태 확인 엔드포인트는 `GET /health`입니다.

## Railway deploy

리포지토리 루트의 `railway.toml`이 Railpack, `npm start`, `/health` 헬스체크를 설정합니다. Railway 프로젝트에서 이 GitHub 리포지토리를 서비스로 가져온 뒤 Public Networking에서 도메인을 생성하면 됩니다.

현재 게임 방은 메모리에만 존재합니다. 따라서 서비스 재시작·재배포 시 진행 중인 방이 사라지고, 복제본을 2개 이상 띄우면 플레이어별 상태가 갈릴 수 있습니다. 실제 운영 전에는 Railway Postgres 또는 Redis 기반 상태 저장소를 붙이고 서비스를 단일 복제본으로 유지해야 합니다.
## macOS 서버 앱 빌드

`Deep Sea Crew Host`는 이 컴퓨터에서 게임 서버를 실행·종료하고, 사용자의 명시적 승인 뒤에만 Cloudflare 터널로 외부 공유를 시작하는 macOS 앱입니다.

```bash
npm install
npm run desktop:build:mac
```

빌드 결과는 `dist/Deep Sea Crew Host-1.0.0-arm64.dmg`에 생성됩니다. Apple 개발자 서명이 없는 로컬 배포본이므로 처음 열 때 macOS의 보안 안내가 보일 수 있습니다.

외부 공유를 사용하려면 Cloudflare CLI를 설치해야 합니다.

```bash
brew install cloudflared
```

앱에서 `Cloudflare 로그인`을 눌러 브라우저 로그인·도메인 승인을 마친 뒤, `외부 공개 승인`을 눌러야만 터널이 시작됩니다.
