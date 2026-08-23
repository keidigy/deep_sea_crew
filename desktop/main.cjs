const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const PORT = 3001;
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
const appRoot = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : path.join(__dirname, '..');
const serverPath = path.join(appRoot, 'server.mjs');
let mainWindow;
let serverProcess;
let tunnelProcess;
let loginProcess;
const status = { server: 'stopped', serverManaged: false, cloudflare: 'not-checked', externalUrl: '', message: '서버를 시작해 방을 만드세요.' };

function emitStatus() { mainWindow?.webContents.send('host-status', { ...status }); }
function setStatus(next) { Object.assign(status, next); emitStatus(); }
function appendMessage(message) { setStatus({ message: String(message).trim().slice(-500) || status.message }); }
function probeLocalServer() {
  return new Promise((resolve) => {
    const request = http.get(`${LOCAL_URL}/health`, (response) => { response.resume(); resolve(response.statusCode === 200); });
    request.setTimeout(450, () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}
function cloudflaredCandidates() {
  return [process.env.CLOUDFLARED_PATH, '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', 'cloudflared'].filter(Boolean);
}
function cloudflaredPath() {
  return cloudflaredCandidates().find((candidate) => {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    return !result.error && result.status === 0;
  }) || null;
}
function cloudflareCertificateExists() { return existsSync(path.join(app.getPath('home'), '.cloudflared', 'cert.pem')); }
function stopChild(child) { if (child && !child.killed) child.kill('SIGTERM'); }

async function startServer() {
  if (serverProcess) return { ...status };
  if (await probeLocalServer()) {
    setStatus({ server: 'running', serverManaged: false, message: `이미 ${LOCAL_URL}에서 실행 중인 서버를 사용합니다.` });
    return { ...status };
  }
  if (!existsSync(serverPath)) throw new Error('게임 서버 파일을 찾을 수 없습니다. 앱 설치를 다시 확인해 주세요.');
  const child = spawn(process.execPath, [serverPath], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(PORT), ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProcess = child;
  setStatus({ server: 'starting', serverManaged: true, message: '로컬 게임 서버를 시작하는 중입니다.' });
  child.stdout.on('data', (data) => appendMessage(data));
  child.stderr.on('data', (data) => appendMessage(data));
  child.on('error', (error) => { serverProcess = undefined; setStatus({ server: 'stopped', serverManaged: false, message: `서버 시작 실패: ${error.message}` }); });
  child.on('exit', (code) => { if (serverProcess !== child) return; serverProcess = undefined; setStatus({ server: 'stopped', serverManaged: false, message: `로컬 서버가 종료되었습니다${code === 0 ? '.' : ` (코드 ${code})`}` }); });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (await probeLocalServer()) { setStatus({ server: 'running', serverManaged: true, message: `로컬 서버가 ${LOCAL_URL}에서 실행 중입니다.` }); return { ...status }; }
  }
  throw new Error('서버 시작 시간을 초과했습니다. 상태 메시지를 확인해 주세요.');
}
async function stopServer() {
  stopTunnel();
  if (!serverProcess) { setStatus({ server: 'stopped', serverManaged: false, message: '이 앱이 시작한 서버가 없습니다.' }); return { ...status }; }
  const child = serverProcess; serverProcess = undefined; stopChild(child);
  setStatus({ server: 'stopped', serverManaged: false, message: '로컬 게임 서버를 종료했습니다.' });
  return { ...status };
}
function stopTunnel() {
  if (tunnelProcess) { const child = tunnelProcess; tunnelProcess = undefined; stopChild(child); }
  if (status.externalUrl || status.cloudflare === 'sharing') setStatus({ cloudflare: cloudflareCertificateExists() ? 'logged-in' : 'not-checked', externalUrl: '', message: 'Cloudflare 외부 공개를 종료했습니다.' });
}
async function loginCloudflare() {
  const binary = cloudflaredPath();
  if (!binary) throw new Error('cloudflared를 찾을 수 없습니다. Homebrew에서 `brew install cloudflared`를 실행한 뒤 다시 시도해 주세요.');
  if (loginProcess) return { ...status };
  setStatus({ cloudflare: 'logging-in', message: '브라우저에서 Cloudflare 로그인과 도메인 승인을 완료해 주세요.' });
  loginProcess = spawn(binary, ['tunnel', 'login'], { stdio: ['ignore', 'pipe', 'pipe'] });
  loginProcess.stdout.on('data', (data) => appendMessage(data));
  loginProcess.stderr.on('data', (data) => appendMessage(data));
  loginProcess.on('exit', (code) => {
    loginProcess = undefined;
    const loggedIn = code === 0 && cloudflareCertificateExists();
    setStatus({ cloudflare: loggedIn ? 'logged-in' : 'not-checked', message: loggedIn ? 'Cloudflare 로그인이 완료되었습니다. 외부 공개를 승인할 수 있습니다.' : 'Cloudflare 로그인이 완료되지 않았습니다.' });
  });
  return { ...status };
}
async function shareWithCloudflare() {
  if (status.server !== 'running') throw new Error('먼저 로컬 서버를 시작해 주세요.');
  if (!cloudflareCertificateExists()) throw new Error('외부 공개 전 Cloudflare 로그인을 완료해 주세요.');
  if (tunnelProcess) return { ...status };
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning', buttons: ['외부 공개 승인', '취소'], defaultId: 1, cancelId: 1,
    title: 'Cloudflare 외부 공개',
    message: '로컬 게임 서버를 Cloudflare 터널로 인터넷에 공개할까요?',
    detail: '초대 주소를 가진 사람은 서버가 실행되는 동안 이 방에 접속할 수 있습니다. 공개는 언제든 앱에서 종료할 수 있습니다.'
  });
  if (confirmation.response !== 0) return { ...status };
  const binary = cloudflaredPath();
  if (!binary) throw new Error('cloudflared를 찾을 수 없습니다. Homebrew에서 `brew install cloudflared`를 실행한 뒤 다시 시도해 주세요.');
  const child = spawn(binary, ['tunnel', '--no-autoupdate', '--url', LOCAL_URL], { stdio: ['ignore', 'pipe', 'pipe'] });
  tunnelProcess = child;
  setStatus({ cloudflare: 'sharing', externalUrl: '', message: 'Cloudflare 터널 주소를 만드는 중입니다.' });
  const readTunnelOutput = (data) => {
    const line = String(data); const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) setStatus({ cloudflare: 'sharing', externalUrl: match[0], message: '외부 초대 주소가 준비되었습니다.' });
    else appendMessage(line);
  };
  child.stdout.on('data', readTunnelOutput); child.stderr.on('data', readTunnelOutput);
  child.on('exit', (code) => { if (tunnelProcess !== child) return; tunnelProcess = undefined; setStatus({ cloudflare: cloudflareCertificateExists() ? 'logged-in' : 'not-checked', externalUrl: '', message: `Cloudflare 터널이 종료되었습니다${code === 0 ? '.' : ` (코드 ${code})`}` }); });
  return { ...status };
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 760, height: 680, minWidth: 620, minHeight: 560, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.whenReady().then(() => {
  createWindow();
  ipcMain.handle('host:status', () => ({ ...status, cloudflare: cloudflareCertificateExists() ? (status.cloudflare === 'not-checked' ? 'logged-in' : status.cloudflare) : status.cloudflare }));
  ipcMain.handle('host:start', startServer); ipcMain.handle('host:stop', stopServer);
  ipcMain.handle('cloudflare:login', loginCloudflare); ipcMain.handle('cloudflare:share', shareWithCloudflare);
  ipcMain.handle('cloudflare:stop', () => { stopTunnel(); return { ...status }; });
  ipcMain.handle('host:open-local', async () => { await shell.openExternal(LOCAL_URL); return { ...status }; });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { stopChild(loginProcess); stopTunnel(); stopChild(serverProcess); });
