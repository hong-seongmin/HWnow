# HWnow: 실시간 시스템 모니터링 데스크톱 애플리케이션

**Go + React + TypeScript + Wails v2**로 개발된 네이티브 데스크톱 애플리케이션으로, 컴퓨터의 주요 자원(CPU, 메모리, 디스크, 네트워크, GPU)을 실시간으로 모니터링합니다.

## ✨ 주요 기능

- **🖥️ 네이티브 데스크톱 앱**: Wails v2 기반으로 웹 기술을 사용한 크로스 플랫폼 데스크톱 애플리케이션
- **📊 실시간 모니터링**: 3초 간격으로 시스템 자원 데이터를 실시간 수집 및 시각화
- **🎛️ 다양한 위젯**: 
  - CPU 사용률 및 개별 코어 모니터링
  - 메모리 사용량 및 상세 정보
  - 디스크 I/O 및 용량 정보
  - 네트워크 사용량 및 상태
  - GPU 사용률 및 프로세스 모니터링
  - 시스템 업타임, 배터리, 프로세스 관리 등
- **🎨 사용자 맞춤 대시보드**: 
  - 드래그 앤 드롭으로 위젯 자유 배치
  - 위젯 크기 조절 및 자동 저장
  - 전체화면, 설정, 제거 등 위젯 관리 기능
- **🌙 테마 지원**: 라이트/다크 모드 지원
- **📱 반응형 디자인**: 다양한 화면 크기에 최적화된 UI

## 🚀 빠른 시작

### 1. 사전 요구 사항
- **[Go](https://go.dev/dl/)** (1.18 이상) - 백엔드 빌드용
- **[Node.js](https://nodejs.org/)** (18.x 이상) - 프론트엔드 빌드용
- **[Wails CLI](https://wails.io/docs/gettingstarted/installation)** - 데스크톱 앱 빌드 도구

#### Wails CLI 설치
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 2. 프로젝트 다운로드 & 개발서버 실행
```cmd
git clone https://github.com/hong-seongmin/HWnow
cd HWnow
start.bat 1
```

### 3. 프로덕션 빌드
```cmd
start.bat 2
```

## 📋 사용법

### 개발 모드 (라이브 리로드)
```cmd
start.bat 1
```
- 개발서버 시작으로 코드 변경 시 자동 리로드
- 네이티브 데스크톱 창이 자동으로 열림
- 개발자 도구 사용 가능

### 프로덕션 빌드
```cmd
start.bat 2
```
- 최적화된 독립실행파일 `HWnow-wails.exe` 생성 (약 30-40MB)
- 배포용 최종 버전

### 직접 실행
빌드 완료 후 `HWnow-wails.exe` 더블클릭으로 실행

## 🛠️ 기술 스택

- **백엔드**: Go 1.24.5 + Wails v2
  - 시스템 모니터링: [gopsutil](https://github.com/shirou/gopsutil)
  - GPU 모니터링: nvidia-smi 통합
- **프론트엔드**: React 18 + TypeScript + Vite
  - 상태관리: [Zustand](https://github.com/pmndrs/zustand)
  - 그리드 시스템: [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
- **데스크톱 프레임워크**: [Wails v2](https://wails.io/)

## 🔧 문제 해결

### Go 설치 오류
```
go: command not found
```
**해결방법**: [Go 공식 사이트](https://go.dev/dl/)에서 설치 후 환경변수 설정 확인

### Node.js 설치 오류
```
npm: command not found
```
**해결방법**: [Node.js 공식 사이트](https://nodejs.org/)에서 LTS 버전 설치

### Wails CLI 설치 오류
```
wails: command not found
```
**해결방법**: 
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 프론트엔드 의존성 설치 실패
```
npm install 실패
```
**해결방법**: 
```bash
cd HWnow-wails/HWnow-wails/frontend
rm -rf node_modules package-lock.json
npm install
```

### GPU 모니터링이 작동하지 않는 경우
- **NVIDIA GPU**: nvidia-smi가 PATH에 있는지 확인
- **기타 GPU**: 현재 NVIDIA GPU만 지원

## ✅ 검증된 빌드 환경

**테스트 환경**: Windows 10/11, Go 1.24.5, Node.js v22.14.0, Wails v2.10.2

### 빌드 성능
- **개발서버 시작**: 10-15초 (첫 실행 시)
- **프로덕션 빌드**: 1-2분 (의존성 다운로드 포함)
- **최종 실행파일 크기**: 30-40MB (모든 의존성 포함)

### 실행 확인
- ✅ 실시간 CPU, 메모리, 디스크, 네트워크, GPU 모니터링
- ✅ 3초 간격 데이터 업데이트
- ✅ 드래그 앤 드롭 위젯 관리
- ✅ 라이트/다크 테마 전환
- ✅ 반응형 레이아웃

## 🎯 주요 위젯 기능

### CPU 모니터링
- 전체 CPU 사용률
- 개별 코어별 사용률
- CPU 모델명 및 코어 수 표시

### 메모리 모니터링
- 실시간 메모리 사용량
- 사용 가능한 메모리
- 메모리 사용률 백분율

### GPU 모니터링
- GPU 사용률 (NVIDIA만 지원)
- GPU 프로세스 목록
- GPU 메모리 사용량

### 시스템 정보
- 시스템 업타임
- 프로세스 모니터링
- 네트워크 상태
- 배터리 정보 (노트북)

## 💖 후원 및 지원

프로젝트가 도움이 되었다면 후원으로 지원해주세요!

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/oursophy)

**GitHub Repository**: [https://github.com/hong-seongmin/HWnow](https://github.com/hong-seongmin/HWnow)

## 📄 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.