const http = require('http');
const { execSync } = require('child_process');

console.log('🔍 Testing Wails application...');

// Test 1: Check if server is responding
console.log('\n1. Testing server response...');
try {
  const response = execSync('curl -s -w "HTTP_CODE:%{http_code}" http://localhost:34115', { encoding: 'utf8' });
  console.log('✅ Server is responding');
} catch (error) {
  console.log('❌ Server not responding:', error.message);
  process.exit(1);
}

// Test 2: Check main.tsx loading
console.log('\n2. Testing main.tsx...');
try {
  const mainContent = execSync('curl -s "http://localhost:5173/src/main.tsx"', { encoding: 'utf8' });
  if (mainContent.includes('React') && mainContent.includes('App')) {
    console.log('✅ main.tsx loads correctly');
  } else {
    console.log('❌ main.tsx has issues');
  }
} catch (error) {
  console.log('❌ main.tsx failed to load:', error.message);
}

// Test 3: Check CSS loading
console.log('\n3. Testing CSS...');
try {
  const cssResponse = execSync('curl -s -I "http://localhost:5173/src/index.css"', { encoding: 'utf8' });
  if (cssResponse.includes('200 OK')) {
    console.log('✅ CSS loads correctly');
  } else {
    console.log('❌ CSS loading failed');
  }
} catch (error) {
  console.log('❌ CSS test failed:', error.message);
}

// Test 4: Check dependencies
console.log('\n4. Testing React dependencies...');
try {
  const reactDep = execSync('curl -s "http://localhost:5173/node_modules/.vite/deps/react.js?v=f7f7fb45" | head -5', { encoding: 'utf8' });
  if (reactDep.includes('React') || reactDep.includes('react')) {
    console.log('✅ React dependency available');
  } else {
    console.log('❌ React dependency missing');
    console.log('Sample:', reactDep);
  }
} catch (error) {
  console.log('❌ React dependency test failed:', error.message);
}

// Test 5: Create HTML test page
console.log('\n5. Creating direct HTML test...');
const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Direct Test</title>
    <style>
        body { font-family: Arial; padding: 20px; }
        .success { color: green; }
        .error { color: red; }
    </style>
</head>
<body>
    <h1>Direct HTML Test</h1>
    <div id="results"></div>
    <script type="module">
        const results = document.getElementById('results');
        
        try {
            results.innerHTML += '<p class="success">✅ JavaScript is working</p>';
            
            // Test React import
            import('http://localhost:5173/node_modules/.vite/deps/react.js?v=f7f7fb45')
                .then(React => {
                    results.innerHTML += '<p class="success">✅ React import successful</p>';
                    console.log('React loaded:', React);
                })
                .catch(error => {
                    results.innerHTML += '<p class="error">❌ React import failed: ' + error.message + '</p>';
                    console.error('React import error:', error);
                });
            
            // Test App import
            import('http://localhost:5173/src/App.tsx')
                .then(App => {
                    results.innerHTML += '<p class="success">✅ App import successful</p>';
                    console.log('App loaded:', App);
                })
                .catch(error => {
                    results.innerHTML += '<p class="error">❌ App import failed: ' + error.message + '</p>';
                    console.error('App import error:', error);
                });
                
        } catch (error) {
            results.innerHTML += '<p class="error">❌ Critical error: ' + error.message + '</p>';
            console.error('Critical error:', error);
        }
    </script>
</body>
</html>
`;

require('fs').writeFileSync('C:\\Users\\user\\Desktop\\FileFolder\\github\\HWnow\\test.html', testHtml);
console.log('✅ Test HTML created at: C:\\Users\\user\\Desktop\\FileFolder\\github\\HWnow\\test.html');

console.log('\n🎯 Next steps:');
console.log('1. Open test.html in browser to see direct import results');
console.log('2. Open http://localhost:34115 and check F12 Console');
console.log('3. Compare results between test.html and main app');