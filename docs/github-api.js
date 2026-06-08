const _TOKEN = '__APP_TOKEN__';

class GitHubAPI {
  constructor() {
    this.token = _TOKEN;
    this.owner = 'why-only-english';
    this.repo = 'DongminPt';
    this.branch = 'main';
    this.base = `https://api.github.com/repos/${this.owner}/${this.repo}`;
  }

  get _headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
  }

  _b64ToUtf8(b64) {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  _utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
  }

  _bytesToB64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
  }

  async _getKey() {
    const keyB64 = sessionStorage.getItem('dongminpt_key');
    const keyBytes = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async _encrypt(bytes) {
    const key = await this._getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    const result = new Uint8Array(12 + encrypted.byteLength);
    result.set(iv);
    result.set(new Uint8Array(encrypted), 12);
    return this._bytesToB64(result);
  }

  async _decrypt(b64) {
    const key = await this._getKey();
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12)
    );
    return new Uint8Array(decrypted);
  }

  async getJSON(path) {
    const res = await fetch(`${this.base}/contents/${path}`, { headers: this._headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`파일 읽기 실패 (${path}): ${res.status}`);
    const data = await res.json();
    const fileContent = this._b64ToUtf8(data.content);

    let parsed;
    try {
      const decrypted = await this._decrypt(fileContent);
      parsed = JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
      parsed = JSON.parse(fileContent); // 기존 비암호화 데이터 호환
    }
    return { data: parsed, sha: data.sha };
  }

  async putJSON(path, content, sha, message) {
    const encrypted = await this._encrypt(new TextEncoder().encode(JSON.stringify(content, null, 2)));
    const body = { message: message || `update ${path}`, content: this._utf8ToB64(encrypted) };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT', headers: this._headers, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `파일 저장 실패 (${path})`);
    }
    return res.json();
  }

  async putImage(path, base64Data, message) {
    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const encrypted = await this._encrypt(imageBytes);

    let sha;
    const check = await fetch(`${this.base}/contents/${path}`, { headers: this._headers });
    if (check.ok) sha = (await check.json()).sha;

    const body = { message: message || '이미지 업로드', content: this._utf8ToB64(encrypted) };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT', headers: this._headers, body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '이미지 업로드 실패');
    }
    return res.json();
  }

  async getImageUrl(path) {
    const res = await fetch(`${this.base}/contents/${path}`, { headers: this._headers });
    if (!res.ok) throw new Error('이미지 로드 실패');
    const data = await res.json();
    const fileContent = this._b64ToUtf8(data.content);
    const decrypted = await this._decrypt(fileContent);
    const blob = new Blob([decrypted], { type: 'image/jpeg' });
    return URL.createObjectURL(blob);
  }
}
