let token = sessionStorage.getItem('fiber-token');

export function setToken(value) {
    token = value;
    if (token) sessionStorage.setItem('fiber-token', token);
    else sessionStorage.removeItem('fiber-token');
}

export const hasToken = () => Boolean(token);

export async function request(path, {method = 'GET', body, file = false} = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api${path}`, {method, headers, body: JSON.stringify(body)});
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const error = new Error(data.detail || '暂时无法访问工位，请稍后重试。');
        error.status = response.status;
        if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('fiber-session-expired'));
        throw error;
    }
    if (!file) return response.json();
    const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition'))?.[1] ?? 'inspection.json';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 3000);
}

export const post = (path, body) => request(path, {method: 'POST', body});
