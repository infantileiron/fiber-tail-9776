import {badge, empty, formError, pageTitle} from '../components/common/presentation.js';
import {route} from '../router/location.js';
import {state, isAnalyst} from '../stores/workbench.js';
import {esc, number, today, version} from '../utils/format.js';

export function lotsPage() {
    const lots = state.lots;
    const totalKg = lots.reduce((total, lot) => total + lot.shipment_kg, 0);
    const samples = lots.reduce((total, lot) => total + lot.sample_count, 0);
    const pending = lots.filter(lot => !lot.outcome).length;
    return `${pageTitle('来料验收 / 批号台账', '批号台账', '按供货批号查看干样记录和已发布的收料决定。',
        isAnalyst() ? '<button type="button" class="button primary" id="open-lot">＋ 登记批号</button>' : '')}
        <section class="ledger-intro" aria-label="台账总览"><div class="ledger-main">
            <span class="eyebrow">登记到货重量</span><strong>${number(totalKg / 1000, 3)} <small>吨</small></strong>
            <p>${lots.length} 个供货批号 · ${samples} 份干样</p></div>
            <div class="ledger-note"><span class="eyebrow">待发布收料决定</span><strong>${pending} <small>批</small></strong>
            <p>卸货前请核对后舱抽样和超标重量。</p></div>
            <div class="ledger-fabric" aria-hidden="true"><i></i><i></i><i></i></div>
        </section>
        <section class="block"><header class="block-head"><div><h2>来料批次</h2><p>最近到货在前，同日按供货批号排序</p></div><span class="mono">${lots.length} 批</span></header>
        ${lots.length ? `<div class="table-scroll"><table id="lot-table"><thead><tr><th>供货批号 / 到货日</th><th>供货方 / 来料</th><th>到货 kg</th><th>干样</th><th>已发布决定</th><th><span class="sr-only">操作</span></th></tr></thead>
        <tbody>${lots.map(lot => `<tr><td><a class="record-code" href="${route('samples', lot.id)}">${esc(lot.code)}</a><small>${esc(lot.received_on)}</small></td>
        <td>${esc(lot.supplier)}<small>${esc(lot.material)}</small></td><td class="mono">${number(lot.shipment_kg)}</td>
        <td><strong>${lot.sample_count} 份</strong><small>${number(lot.total_dry_g)} g</small></td>
        <td>${badge(lot.outcome)}${lot.published_version ? `<small>${version(lot.published_version)}</small>` : ''}</td>
        <td><a class="text-link" href="${route('samples', lot.id)}" aria-label="${esc(lot.code)} 查看称重">称重记录 ↗</a></td></tr>`).join('')}</tbody></table></div>`
            : empty('台账还没有批号', '称重分析岗可登记第一车来料，再录入每份干样重量。')}</section>
        ${isAnalyst() ? `<dialog id="lot-dialog"><div class="dialog-head"><h2>登记供货批号</h2><button type="button" class="bare" id="close-lot" aria-label="关闭">×</button></div>
        <form id="lot-form" class="form-stack"><label>供货批号<input name="code" maxlength="32" pattern="[A-Z0-9][A-Z0-9\\-]+" placeholder="MD-1121-05" required></label>
        <label>供货方<input name="supplier" maxlength="80" required></label><label>来料名称<input name="material" maxlength="80" required></label>
        <div class="pair"><label>到货日期<input name="received_on" type="date" value="${today()}" required></label><label>到货重量 / kg<input name="shipment_kg" type="number" min="1" max="100000" required></label></div>
        ${formError}<button type="submit" class="button primary">保存并记录干样</button></form></dialog>` : ''}`;
}
