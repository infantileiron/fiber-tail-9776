export function esc(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[char]);
}

export const number = (value, max = 2) => Intl.NumberFormat('zh-CN', {maximumFractionDigits: max}).format(value);
export const pct = value => `${Number(value).toFixed(2)}%`;
export const signed = value => `${value > 0 ? '+' : ''}${Number(value).toFixed(2)} pp`;
export const version = value => `V${String(value).padStart(2, '0')}`;
export const stamp = value => value ? new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value)) : '—';
export const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date());
