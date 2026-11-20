(() => {
  const input = document.getElementById('dispatch-file');
  const status = document.getElementById('dispatch-status');
  const issues = document.getElementById('dispatch-issues');
  let worker, timer;
  function stop() {
    clearTimeout(timer);
    worker?.terminate();
    worker = null;
  }
  input.addEventListener('change', () => {
    stop();
    issues.replaceChildren();
    const file = input.files[0];
    if (!file) { status.textContent = '검사할 파일을 선택하세요.'; return; }
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) {
      status.textContent = '5MB 이하의 .xlsx 파일을 선택하세요.';
      return;
    }
    status.textContent = '엑셀을 확인하고 있어요…';
    const failed = () => { stop(); status.textContent = '파일을 열 수 없어요. 암호가 없는 .xlsx 사본으로 다시 시도해 주세요.'; };
    try {
      worker = new Worker('/assets/dispatch-worker.js');
      worker.onerror = failed;
      worker.onmessage = ({data}) => {
        stop();
        status.textContent = data.message;
        for (const item of data.issues || []) {
          const li = document.createElement('li');
          li.textContent = item;
          issues.append(li);
        }
      };
      timer = setTimeout(() => {
        stop();
        status.textContent = '처리 시간이 길어 중단했어요. 발송할 행만 남긴 사본으로 다시 시도해 주세요.';
      }, 30000);
      worker.postMessage(file);
    } catch { failed(); }
  });
})();
