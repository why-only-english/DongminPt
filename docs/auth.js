const _HASH = '__PASSWORD_HASH__';

async function _sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function _deriveKey(password) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new TextEncoder().encode('dongminpt-v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exported = await crypto.subtle.exportKey('raw', key);
  let binary = '';
  new Uint8Array(exported).forEach(b => binary += String.fromCharCode(b));
  return btoa(binary);
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
      sessionStorage.setItem('dongminpt_key', await _deriveKey(pw));
      document.getElementById('password-screen').style.display = 'none';
      onSuccess();
    } else {
      document.getElementById('pw-error').textContent = '비밀번호가 틀렸습니다.';
      document.getElementById('input-password').value = '';
      document.getElementById('input-password').focus();
    }
  });
}
