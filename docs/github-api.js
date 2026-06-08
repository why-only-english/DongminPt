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

  async getJSON(path) {
    const res = await fetch(`${this.base}/contents/${path}`, { headers: this._headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`파일 읽기 실패 (${path}): ${res.status}`);
    const data = await res.json();
    return { data: JSON.parse(this._b64ToUtf8(data.content)), sha: data.sha };
  }

  async putJSON(path, content, sha, message) {
    const body = {
      message: message || `update ${path}`,
      content: this._utf8ToB64(JSON.stringify(content, null, 2)),
    };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT',
      headers: this._headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `파일 저장 실패 (${path})`);
    }
    return res.json();
  }

  async putImage(path, base64Data, message) {
    let sha;
    const check = await fetch(`${this.base}/contents/${path}`, { headers: this._headers });
    if (check.ok) {
      const d = await check.json();
      sha = d.sha;
    }
    const body = { message: message || '이미지 업로드', content: base64Data };
    if (sha) body.sha = sha;
    const res = await fetch(`${this.base}/contents/${path}`, {
      method: 'PUT',
      headers: this._headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '이미지 업로드 실패');
    }
    return res.json();
  }

  rawUrl(path) {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
  }
}
