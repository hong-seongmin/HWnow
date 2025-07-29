# HWnow: 실시간 컴퓨팅 자원 모니터링 웹앱

Go 언어 백엔드와 React 프론트엔드를 사용하여 실시간으로 컴퓨터의 주요 자원(CPU, 메모리, 디스크, 네트워크) 사용량을 모니터링하는 웹 애플리케이션입니다.

## ✨ 주요 기능

- **실시간 모니터링**: 웹소켓을 통해 시스템 자원 데이터를 실시간으로 시각화
- **다양한 위젯**: CPU, 메모리, 디스크 I/O, 네트워크 I/O 등 주요 자원별 모니터링 위젯
- **사용자 맞춤 대시보드**: 드래그 앤 드롭으로 위젯 위치 변경, 크기 조절, 자동 저장
- **테마 지원**: 라이트/다크 모드 지원 (Ctrl+T로 전환)

## 🚀 빠른 시작

### 1. 사전 요구 사항
- **[Go](https://go.dev/dl/)** (1.18 이상) - [공식 MSI 설치 프로그램](https://go.dev/dl/go1.24.5.windows-amd64.msi) 권장
- **[Node.js](https://nodejs.org/)** (18.x 이상)

### 2. 프로젝트 다운로드 & 실행
```cmd
git clone https://github.com/hong-seongmin/HWnow
cd HWnow
start.bat 1
```

### 3. 브라우저에서 확인
`http://localhost:8080` 접속 (기본값, config.json에서 변경 가능)

## 📋 사용법

### 자동 빌드 & 실행
```cmd
start.bat 1
```
- 프론트엔드 자동 빌드
- 백엔드 컴파일 및 실행
- `HWnow.exe` 생성 후 즉시 실행

### 빌드만 수행
```cmd
start.bat 2
```
- `HWnow.exe` 독립실행파일만 생성 (약 17MB)
- 실행하지 않고 빌드만 완료

### 수동 빌드 (고급 사용자)
```bash
# 프론트엔드 빌드
cd frontend && npm install && npm run build && cd ..

# 백엔드 빌드
cp -r frontend/dist/* backend/dist/
cd backend && go build -o ../HWnow.exe main.go && cd ..
```

## 🔧 문제 해결

### Go 설치 오류
```
go: command not found
```
**해결방법**: [Go 공식 사이트](https://go.dev/dl/)에서 MSI 파일 다운로드 후 설치

### Node.js 설치 오류
```
npm: command not found
```
**해결방법**: [Node.js 공식 사이트](https://nodejs.org/)에서 설치

### 의존성 설치 실패
```
npm install 실패
```
**해결방법**: 
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### 포트 충돌 및 설정 변경
기본 포트 8080이 사용 중인 경우 `config.json`에서 포트 변경:
```json
{
  "server": {
    "port": 9090,
    "host": "localhost"
  }
}
```
설정 변경 후 HWnow.exe 재시작

## ✅ 검증된 빌드 결과

**테스트 환경**: Windows 10/11, Go 1.24.5, Node.js v22.14.0

### 빌드 성능
- **프론트엔드 빌드**: 6.65초 (TypeScript + Vite)
- **백엔드 빌드**: 약 2-3분 (첫 빌드, Go 의존성 다운로드 포함)
- **최종 파일 크기**: 17MB (모든 의존성 내장)

### 실행 확인
- ✅ 포트 설정 적용 (config.json: 9090 → 실제 실행: 9090)
- ✅ 실시간 모니터링 데이터 수집 (CPU, 메모리, 디스크, 네트워크, GPU)
- ✅ 웹소켓 연결 및 클라이언트 감지
- ✅ SQLite 데이터베이스 자동 생성

## 💖 후원 및 지원

프로젝트가 마음에 드셨다면 후원을 통해 지원해주세요.

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/oursophy)

**GitHub Repository**: [https://github.com/hong-seongmin/HWnow](https://github.com/hong-seongmin/HWnow)