const _HASH = '__PASSWORD_HASH__';

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function requireAuth(onSuccess) {
  if (sessionStorage.getItem('dongminpt_auth') === 'ok') {
    onSuccess();
    return;
  }

  document.getElementById('password-screen').style.display = 'flex';

  document.getElementById('password-form').addEventListener('submit', async e => {
    e.preventDefault();
    const pw = document.getElementById('input-password').value;
    const hash = await _sha256(pw);
    if (hash === _HASH) {
      sessionStorage.setItem('dongminpt_auth', 'ok');
      document.getElementById('password-screen').style.display = 'none';
      onSuccess();
    } else {
      document.getElementById('pw-error').textContent = '비밀번호가 틀렸습니다.';
      document.getElementById('input-password').value = '';
      document.getElementById('input-password').focus();
    }
  });
}
