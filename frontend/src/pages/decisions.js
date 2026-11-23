import {distribution} from '../components/common/chart.js';
import {badge, empty, formError, history, lotStrip, pageTitle} from '../components/common/presentation.js';
import {actions, outcomeLabel, parameterFields} from '../constants/labels.js';
import {route} from '../router/location.js';
import {isObserver, isReviewer, state} from '../stores/workbench.js';
import {esc, number, pct, signed, stamp, version} from '../utils/format.js';

function comparison(report) {
    const delta = report.result.comparison;
    if (!delta) return '';
    const changes = parameterFields.filter(([key]) => Number(delta.previous_parameters[key]) !== Number(report.parameters[key]))
        .map(([key, label]) => `${label} ${pct(delta.previous_parameters[key])} → ${pct(report.parameters[key])}`);
    return `<div class="comparison"><b>对比 ${version(delta.previous_version)}</b>
        <p>${delta.same_samples ? '干样快照相同' : '干样快照有变，差额含样本影响'}${changes.length ? ` · ${changes.join('，')}` : ' · 参数相同'}</p>
        <span>超标份额 <strong>${signed(delta.exceed_delta_pp)}</strong> · 尾部均值 <strong>${signed(delta.tail_delta_pp)}</strong></span></div>`;
}

function decisionPanel(work, report) {
    if (report.outcome) return `<section class="decision-panel"><div><p class="eyebrow">已发布收料决定</p><h2>${outcomeLabel[report.outcome]}</h2>
        <p>${esc(report.rationale)}</p></div><p class="quiet">${esc(report.reviewer)} · ${stamp(report.published_at)}</p></section>`;
    if (!isReviewer()) return '<section class="decision-panel"><div><p class="eyebrow">收料决定</p><h2>等待复核</h2><p>收料复核岗可根据尾部数据填写理由并发布决定。</p></div></section>';
    if (work.inspections[0]?.id !== report.id) return '<section class="decision-panel"><p>该版本可追溯，请切换到最新版本进行复核。</p></section>';
    return `<section class="decision-panel"><div><p class="eyebrow">收料复核</p><h2>发布验收决定</h2><p>根据现场处理情况选择决定，并保留交接理由。</p></div>
        <form id="decision-form" class="form-stack"><label>收料决定<select name="outcome" required>
        ${Object.entries(outcomeLabel).map(([value, label]) => `<option value="${value}" ${value === report.result.recommendation ? 'selected' : ''}>${label}</option>`).join('')}
        </select></label><label>复核理由<textarea name="rationale" minlength="4" maxlength="400" rows="3" required></textarea></label>
        ${formError}<button class="button primary" type="submit">发布收料决定</button></form></section>`;
}

export function decisionsPage() {
    const work = state.workspace;
    const report = state.report;
    if (!work) return empty('没有验收单', '至少需要一批来料和已完成的诊断。', '#lots', '返回批号台账');
    const header = pageTitle('来料验收 / 收料决定', '收料决定', '复核截尾明细、对比口径版本，并向仓务移交。',
        report?.result ? '<button class="button secondary" type="button" id="export-run">↓ 导出验收单</button>' : '');
    const strip = lotStrip(work.lot, work.samples);
    if (!report?.result) return `${header}${strip}<div class="work-columns">${empty('当前版本暂无诊断结果', esc(report?.error ?? '验收单将在计算完成后出现。'),
        route('diagnosis', work.lot.id), '查看尾部诊断')}<section class="block"><header class="block-head"><h2>验收单版本</h2></header>${history('decisions', work, report?.id)}</section></div>`;
    const {result, parameters} = report;
    return `${header}${strip}<section class="report-summary" id="report-summary" data-run="${report.id}">
        <div class="report-title"><span class="eyebrow">${esc(report.lot_code)} · ${version(report.version)}</span><h2>重量加权尾部诊断</h2>
        <p>${result.sample_count} 份快照 · ${number(result.total_dry_g)} g · 全样加权均值 ${pct(result.weighted_mean_pct)}</p></div>
        <div class="report-metric"><span>超标重量份额</span><strong id="exceed-value">${pct(result.exceed_share_pct)}</strong>
        <small>${number(result.exceed_g)} g 严格高于 ${pct(parameters.threshold_pct)} · 份额上限 ${pct(parameters.exceed_cap_pct)}</small></div>
        <div class="report-metric"><span>尾部平均杂质率</span><strong id="tail-value">${pct(result.tail_mean_pct)}</strong>
        <small>最高 ${pct(parameters.tail_pct)} 干样 · 上限 ${pct(parameters.tail_cap_pct)}</small></div>
        <div class="report-outcome"><span>${report.outcome ? '发布结论' : '规则建议'}</span>${badge(report.outcome ?? result.recommendation)}</div></section>
        ${comparison(report)}
        <div class="work-columns report-columns"><section class="block"><header class="block-head"><div><h2>加权经验分布</h2><p>每一级阶梯由同一杂质率的干样重量叠加</p></div></header>
        <div class="inset chart-wrap">${distribution(result.ecdf, Number(parameters.threshold_pct))}</div></section>
        <section class="block"><header class="block-head"><div><h2>尾部截取明细</h2><p>从高杂质样向下取满 ${number(result.tail_g, 4)} g</p></div></header>
        <div class="table-scroll"><table id="tail-table"><thead><tr><th>样号</th><th>杂质率</th><th>取入 / 原重 g</th></tr></thead><tbody>
        ${result.tail_contributions.map(row => `<tr><td class="record-code">${esc(row.code)}</td><td>${pct(row.concentration_pct)}</td>
        <td class="mono">${number(row.used_g, 4)} / ${number(row.dry_g)}${row.used_g < row.dry_g ? '<small class="cut-note">边界截取</small>' : ''}</td></tr>`).join('')}</tbody></table></div>
        <p class="inset quiet">${result.triggers.length ? `触发规则：${result.triggers.map(trigger => trigger === 'tail_mean' ? '尾部均值超限' : '超标重量份额超限').join('、')}` : '两项指标均在参数上限内。'}</p></section></div>
        ${decisionPanel(work, report)}
        <div class="work-columns trace-columns"><section class="block"><header class="block-head"><div><h2>验收单版本</h2><p>当前快照校验值 <code title="${esc(report.checksum)}">${esc(report.checksum.slice(0, 12))}</code></p></div></header>
        ${history('decisions', work, report.id)}</section>
        ${isObserver() ? '' : `<section class="block"><header class="block-head"><h2>交接记录</h2></header><ol class="audit-trail">
        ${state.audit.slice(0, 6).map(event => `<li><time>${stamp(event.occurred_at)}</time><b>${actions[event.action]}</b>
        <span>${esc(event.reference)} · ${esc(event.actor ?? '后台计算')}</span></li>`).join('')}</ol></section>`}</div>`;
}
