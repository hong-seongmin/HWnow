# HWnow: 실시간 컴퓨팅 자원 모니터링 웹앱

이 프로젝트는 Go 언어로 구현된 백엔드와 React 기반의 프론트엔드를 사용하여 실시간으로 컴퓨터의 주요 자원(CPU, 메모리, 디스크, 네트워크) 사용량을 모니터링하는 웹 애플리케이션입니다.

## ✨ 주요 기능

- **실시간 모니터링**: 웹소켓을 통해 시스템 자원 데이터를 실시간으로 시각화합니다.
- **다양한 위젯**: CPU, 메모리, 디스크 I/O, 네트워크 I/O 등 주요 자원별 모니터링 위젯을 제공합니다.
- **사용자 맞춤 대시보드**:
  - 드래그 앤 드롭으로 위젯 위치를 자유롭게 변경할 수 있습니다.
  - 각 위젯의 크기를 원하는 대로 조절할 수 있습니다.
  - 모든 레이아웃 변경 사항은 브라우저의 로컬 스토리지에 자동으로 저장됩니다.
- **상세한 위젯 설정**:
  - 표시할 데이터 종류, 단위, 업데이트 주기 등을 설정할 수 있습니다.
  - 차트 유형(Line, Area, Bar, Gauge)과 색상을 변경하여 시각화 스타일을 커스터마이징할 수 있습니다.
- **테마 지원**: 라이트 모드와 다크 모드를 모두 지원하며, 단축키(Ctrl+T)로 쉽게 전환할 수 있습니다.

## 🛠️ 기술 스택

| 구분      | 기술                                                               |
| --------- | ------------------------------------------------------------------ |
| **Frontend**  | React, TypeScript, Vite, Zustand, Recharts, React-Grid-Layout    |
| **Backend**   | Go, Gorilla WebSocket                                              |
| **Database**  | SQLite                                                             |

## 📂 프로젝트 구조

```
/
├── backend/         # Go 백엔드 소스코드
│   ├── main.go      # 메인 애플리케이션
│   ├── websockets/  # 웹소켓 핸들러
│   └── ...
├── database/        # SQLite 데이터베이스 파일 (버전 관리 제외 대상)
├── frontend/        # React 프론트엔드 소스코드
│   ├── src/
│   │   ├── components/ # React 컴포넌트
│   │   ├── stores/     # Zustand 상태 관리
│   │   └── ...
│   └── package.json
├── 기획/            # 프로젝트 기획 문서
└── start.bat        # 백엔드/프론트엔드 동시 실행 스크립트
```

## 🚀 시작하기

### 사전 요구 사항

- [Go](https://go.dev/doc/install) (1.18 이상 권장)
- [Node.js](https://nodejs.org/en/download) (18.x 이상 권장)

### 설치 및 실행

1.  **프로젝트 클론**
    ```bash
    git clone https://github.com/hong-seongmin/HWnow
    cd HWnow
    ```

2.  **프론트엔드 의존성 설치**
    ```bash
    cd frontend
    npm install
    cd ..
    ```

3.  **애플리케이션 실행**
    프로젝트 루트 디렉토리에서 아래의 배치 파일을 실행하면 백엔드 서버 빌드 및 실행과 프론트엔드 개발 서버 실행이 동시에 진행됩니다.
    ```bash
    ./start.bat
    ```
    실행 후, 웹 브라우저에서 `http://localhost:5173`으로 접속하여 애플리케이션을 확인할 수 있습니다.

## 💖 후원 및 지원

프로젝트가 마음에 드셨다면, 아래 링크를 통해 저희를 지원해주세요. 여러분의 작은 관심이 큰 힘이 됩니다.

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/oursophy)

프로젝트의 소스 코드는 GitHub에서 확인하실 수 있습니다.

-   **GitHub Repository**: [https://github.com/hong-seongmin/HWnow](https://github.com/hong-seongmin/HWnow)

## 🎯 TODO

-   페이지 기능
-   위젯 옵션 정교화
-   UI 개선
-   빌드 방법 개선