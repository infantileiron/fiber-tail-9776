import {empty, formError, lotStrip, pageTitle} from '../components/common/presentation.js';
import {route} from '../router/location.js';
import {state, isAnalyst} from '../stores/workbench.js';
import {esc, number, stamp} from '../utils/format.js';

export function samplesPage() {
    if (!state.workspace) return empty('没有可称重的批号', '请先在批号台账登记一批来料。', '#lots', '返回台账');
    const {lot, samples} = state.workspace;
    return `${pageTitle('来料验收 / 称重记录', '称重记录', '登记干样总重、分拣杂质重和抽样舱位。',
        `<a class="button secondary" href="${route('diagnosis', lot.id)}">查看尾部诊断 ↗</a>`)}
        ${lotStrip(lot, samples)}
        <div class="work-columns"><section class="block">
        <header class="block-head"><div><h2>干样留档</h2><p>同一批号内，样号对应一份独立干样</p></div><span class="mono">${samples.length} 份</span></header>
        ${samples.length ? `<div class="table-scroll"><table id="sample-table"><thead><tr><th>样号 / 记录时间</th><th>抽样位置</th><th>干样 g</th><th>杂质 g</th></tr></thead><tbody>
        ${samples.map(sample => `<tr><td><strong class="record-code">${esc(sample.code)}</strong><small>${stamp(sample.recorded_at)} · ${esc(sample.recorder)}</small></td>
            <td>${esc(sample.location)}</td><td class="mono">${number(sample.dry_g)}</td><td class="mono">${number(sample.impurity_g)}</td></tr>`).join('')}</tbody></table></div>`
            : empty('还没有称重记录', '称重分析岗需登记至少 3 份有效干样，才能生成尾部诊断。')}</section>
        <section class="block aside-block"><header class="block-head"><h2>${isAnalyst() ? '记录一份干样' : '抽样记录口径'}</h2></header>
        ${isAnalyst() ? `<form id="sample-form" class="form-stack inset"><label>样号<input name="code" maxlength="32" pattern="[A-Z0-9][A-Z0-9\\-]+" required placeholder="如 S-07"></label>
        <label>抽样位置<input name="location" maxlength="80" required placeholder="如 后舱·内层"></label>
        <div class="pair"><label>干样总重 / g<input name="dry_g" type="number" min="1" max="100000" required></label>
        <label>杂质总重 / g<input name="impurity_g" type="number" min="0" max="100000" required></label></div>
        <p class="quiet">请使用干燥后的整数克读数。杂质重量包含在干样总重内，可为 0 g。</p>${formError}
        <button class="button primary" type="submit">保存称重</button></form>` : '<p class="inset quiet">舱位用于回溯原袋，干样重量是后续诊断的权重。称重和补样由分析岗操作。</p>'}
        </section></div>`;
}
