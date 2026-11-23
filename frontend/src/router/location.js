export const sections = [
    ['lots', '批号台账'], ['samples', '称重记录'], ['diagnosis', '尾部诊断'], ['decisions', '收料决定'],
];

export function locationView() {
    const [segment, lot, run] = window.location.hash.slice(1).split('/');
    const page = sections.some(([key]) => key === segment) ? segment : 'lots';
    return {page, lotId: Number(lot) || null, runId: Number(run) || null};
}

export function route(page, lot, run) {
    return `#${[page, lot, run].filter(Boolean).join('/')}`;
}
