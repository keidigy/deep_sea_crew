const $ = (selector) => document.querySelector(selector);
let current = {};
const serverText = { stopped: '서버가 꺼져 있습니다.', starting: '서버를 시작하는 중입니다.', running: '서버가 실행 중입니다.' };
const cloudflareText = { 'not-checked': '외부 공개는 꺼져 있습니다.', 'logging-in': '브라우저에서 로그인 및 도메인 승인을 기다리는 중입니다.', 'logged-in': '로그인됨 · 외부 공개 전 별도 승인이 필요합니다.', sharing: '외부 공유가 실행 중입니다.' };
function render(state) {
  current = state;
  $('#server-status').textContent = state.serverManaged === false && state.server === 'running' ? '다른 프로세스가 실행한 로컬 서버를 사용 중입니다.' : (serverText[state.server] ?? state.server);
  $('#server-badge').textContent = state.server === 'running' ? '실행 중' : state.server === 'starting' ? '시작 중' : '중지됨';
  $('#server-badge').className = `badge ${state.server === 'running' ? 'active' : 'muted'}`;
  $('#cloudflare-status').textContent = cloudflareText[state.cloudflare] ?? '상태 확인 중입니다.';
  $('#cloudflare-badge').textContent = state.cloudflare === 'sharing' ? '공개 중' : state.cloudflare === 'logged-in' ? '로그인됨' : '비공개';
  $('#cloudflare-badge').className = `badge ${state.cloudflare === 'sharing' ? 'active' : 'muted'}`;
  $('#start-server').disabled = state.server === 'running' || state.server === 'starting';
  $('#stop-server').disabled = state.server !== 'running' || !state.serverManaged;
  $('#share-cloudflare').disabled = state.server !== 'running' || state.cloudflare === 'sharing';
  $('#stop-cloudflare').disabled = state.cloudflare !== 'sharing';
  $('#invite').hidden = !state.externalUrl;
  $('#external-url').textContent = state.externalUrl || '';
  $('#message').textContent = state.message || '';
}
async function invoke(action) { try { render(await action()); } catch (error) { $('#message').textContent = error.message; } }
$('#start-server').addEventListener('click', () => invoke(window.hostApp.start));
$('#stop-server').addEventListener('click', () => invoke(window.hostApp.stop));
$('#open-local').addEventListener('click', () => invoke(window.hostApp.openLocal));
$('#login-cloudflare').addEventListener('click', () => invoke(window.hostApp.loginCloudflare));
$('#share-cloudflare').addEventListener('click', () => invoke(window.hostApp.shareCloudflare));
$('#stop-cloudflare').addEventListener('click', () => invoke(window.hostApp.stopCloudflare));
$('#copy-url').addEventListener('click', async () => { if (!current.externalUrl) return; await navigator.clipboard.writeText(current.externalUrl); $('#message').textContent = '외부 초대 주소를 복사했습니다.'; });
window.hostApp.onStatus(render); window.hostApp.status().then(render);
