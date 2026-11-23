import {empty, formError, history, lotStrip, pageTitle} from '../components/common/presentation.js';
import {parameterFields} from '../constants/labels.js';
import {route} from '../router/location.js';
import {state, isAnalyst} from '../stores/workbench.js';
import {esc, pct, version} from '../utils/format.js';

export function diagnosisPage() {
    if (!state.workspace) return empty('没有可诊断的批号', '登记供货批次和干样后可以提交诊断。', '#lots', '返回批号台账');
    const work = state.workspace;
    const report = state.report;
    return `${pageTitle('来料验收 / 尾部诊断', '尾部诊断', '保存独立的参数版本，由后台按干样重量重算。')}
        ${lotStrip(work.lot, work.samples)}
        <div class="work-columns"><section class="block"><header class="block-head"><div><h2>${isAnalyst() ? '新建诊断版本' : '诊断参数'}</h2>
        <p>${isAnalyst() ? '提交时锁定当前称重记录。每个版本保留自己的阈值。' : '称重分析岗可调整阈值并提交重算。'}</p></div></header>
        ${isAnalyst() ? `<form id="run-form" class="form-stack inset"><div class="parameter-grid">
        ${parameterFields.map(([key, label, hint, value, min]) => `<label>${label} <span>%</span><input name="${key}" type="number" step="0.01" min="${min}" max="100" value="${esc(report?.parameters[key] ?? value)}" required><small>${hint}</small></label>`).join('')}</div>
        <div class="form-foot"><p class="quiet">锁定当前 ${work.samples.length} 份干样 · 最少 3 份</p>
        <button class="button primary" type="submit">提交诊断 ↗</button></div>${formError}</form>` : report ? `<dl class="parameter-read inset">
        ${parameterFields.map(([key, label]) => `<div><dt>${label}</dt><dd>${pct(report.parameters[key])}</dd></div>`).join('')}</dl>` : '<p class="inset quiet">没有可显示的参数版本。</p>'}
        </section><section class="block aside-block"><header class="block-head"><div><h2>诊断版本</h2><p>按提交时间倒序</p></div></header>
        ${history('diagnosis', work, report?.id)}</section></div>
        ${report ? `<section class="run-slip" data-status="${report.status}" id="run-slip"><div><p class="eyebrow">${version(report.version)} · 后台计算</p>
        <strong>${({queued: '已排队，正在等待计算', succeeded: '计算完成，验收单已生成', failed: '诊断未完成'})[report.status]}</strong>
        <p>${esc(report.error ?? (report.status === 'queued' ? '保持页面打开即可查看完成状态。' : '验收单包含分布、截尾明细和复核依据。'))}</p></div>
        ${report.result ? `<a class="button secondary" href="${route('decisions', work.lot.id, report.id)}">查看验收单 ↗</a>` : ''}</section>` : ''}`;
}
