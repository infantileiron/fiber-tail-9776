import {empty, formError, pageTitle} from '../components/common/presentation.js';
import {deductionKindLabel, settlementActions, settlementStatusLabel} from '../constants/labels.js';
import {route} from '../router/location.js';
import {isPurchaser, state} from '../stores/workbench.js';
import {esc, number, pct, stamp, today, version} from '../utils/format.js';

const amount = value => Number(value ?? 0);
const signedKg = value => {
    const numeric = amount(value);
    return `${numeric > 0 ? '+' : ''}${number(numeric, 3)}`;
};
const month = () => today().slice(0, 7);
const newKey = () => `settle-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

function statementList(activeId) {
    const statements = state.statements;
    if (!statements.length) return '<p class="quiet inset">还没有结算单。采购岗可按供货方建月度草稿。</p>';
    return `<ol class="run-history statement-list">${statements.map(item => `<li><a href="${route('settlements', item.id)}"
        ${activeId === item.id ? 'aria-current="true"' : ''}><strong>${item.period_start.slice(0, 7)}</strong>
        <span>${esc(item.supplier)} · ${item.line_count} 笔 · ${number(amount(item.total_deduction_kg), 3)} kg</span>
        <span class="badge tone-${item.status === 'locked' ? 'accept' : 'queued'}">${settlementStatusLabel[item.status]}</span></a></li>`).join('')}</ol>`;
}

function newDialog() {
    const suppliers = [...new Set(state.lots.map(lot => lot.supplier))];
    return `<dialog id="settlement-dialog"><div class="dialog-head"><h2>新建结算草稿</h2>
        <button type="button" class="bare" id="close-settlement" aria-label="关闭">×</button></div>
        <form id="settlement-form" class="form-stack"><label>供货方<input name="supplier" list="supplier-options" maxlength="80" required
        value="${esc(suppliers[0] ?? '')}"><datalist id="supplier-options">${suppliers.map(name => `<option value="${esc(name)}">`).join('')}</datalist>
        <small>只结算该供货方在本月到货、且已发布验收的批次；未验完的先留在待办。</small></label>
        <div class="pair"><label>结算月份<input name="period" type="month" value="${month()}" required></label>
        <label>备注<input name="note" maxlength="200" placeholder="如 11 月首期"></label></div>
        <input type="hidden" name="idempotency_key" value="${newKey()}">
        <p class="quiet">同一份草稿重试会沿用这张单，不会重复扣重。</p>${formError}
        <button type="submit" class="button primary">生成草稿</button></form></dialog>`;
}

function statementSummary(statement) {
    const totals = state.statement.totals;
    return `<section class="report-summary settlement-summary" id="settlement-summary">
        <div class="report-title"><span class="eyebrow">${esc(statement.supplier)} · ${statement.period_start.slice(0, 7)}</span>
        <h2>按供货方结算扣重</h2><p>${statement.status === 'locked' ? '已锁定，旧账原样留查' : '草稿，可随时重算'} ·
        锁定 ${esc(statement.locked_by_name ?? '—')} ${stamp(statement.locked_at)}</p></div>
        <div class="report-metric"><span>本期扣重合计</span><strong>${number(amount(totals.deduction_kg), 3)} <small>kg</small></strong>
        <small>${totals.line_count} 笔 · 首次 ${number(amount(totals.base_kg), 3)} · 差额 ${signedKg(totals.revision_kg)} · 晚到 ${number(amount(totals.late_kg), 3)}</small></div>
        <div class="report-outcome"><span>结算状态</span>
        <span class="badge tone-${statement.status === 'locked' ? 'accept' : 'queued'}">${settlementStatusLabel[statement.status]}</span></div></section>`;
}

function lineRows(lines) {
    return lines.map(line => {
        const parameters = line.parameters ?? {};
        return `<tr><td><strong class="record-code">${esc(line.lot_code)}</strong>
            <small>${esc(line.received_on)} · 磅单 ${number(line.shipment_kg)} kg</small></td>
        <td><span class="badge tone-${line.kind === 'revision' ? 'retest' : line.kind === 'late' ? 'pending' : 'accept'}">${deductionKindLabel[line.kind]}</span>
            <small>${esc(line.note || '—')}</small></td>
        <td class="mono">${signedKg(line.deduction_kg)}</td>
        <td class="mono" title="已锁定各期合计；草稿含本行">${number(amount(line.cumulative_deducted_kg), 3)}</td>
        <td><a class="text-link" href="${route('decisions', line.lot_id, line.inspection_id)}">${version(line.inspection_version)}</a>
            <small>超标份额 ${pct(line.exceed_share_pct)} · 线 ${pct(parameters.threshold_pct)} / 尾 ${pct(parameters.tail_pct)}</small>
            <small><code title="${esc(line.inspection_checksum)}">${esc(line.inspection_checksum.slice(0, 12))}</code>
            ${line.prior_inspection_version ? `· 原 ${version(line.prior_inspection_version)}（已扣 ${number(amount(line.prior_deduction_kg), 3)}）` : ''}</small></td></tr>`;
    }).join('');
}

function linesBlock() {
    const lines = state.statement.lines;
    if (!lines.length) return empty('本期还没有可扣重批次', '已发布验收的批次才会生成扣重行；未验完的批次列在下方待办。');
    return `<div class="table-scroll"><table id="settlement-table"><thead><tr><th>批号 / 磅单</th><th>扣重类型</th>
        <th>本期扣重 kg</th><th>累计已扣 kg</th><th>依据版本 / 参数</th></tr></thead><tbody>${lineRows(lines)}</tbody></table></div>`;
}

function pendingBlock() {
    const rows = state.statement.pending_lots ?? [];
    if (!rows.length) return '<p class="inset quiet">本月到货批次都已列入本单。</p>';
    return `<div class="table-scroll"><table id="pending-table"><thead><tr><th>批号</th><th>磅单 kg</th><th>累计已扣 kg</th><th>状态</th><th>处理</th></tr></thead>
        <tbody>${rows.map(row => `<tr><td class="record-code">${esc(row.lot_code)}</td><td class="mono">${number(row.shipment_kg)}</td>
        <td class="mono">${number(amount(row.locked_deducted_kg), 3)}</td>
        <td>${row.accepted ? '<span class="badge tone-queued">已验收未列入</span>' : '<span class="badge tone-pending">待验收</span>'}</td>
        <td>${row.settled_elsewhere ? '已在其他已锁定结算单扣重' : row.accepted ? '下一期补扣' : '验完并发布后重算或下期补扣'}</td></tr>`).join('')}</tbody></table></div>`;
}

function eventsBlock() {
    const events = state.statement.events ?? [];
    if (!events.length) return '';
    return `<ol class="audit-trail">${events.map(event => `<li><time>${stamp(event.occurred_at)}</time>
        <b>${settlementActions[event.action] ?? esc(event.action)}</b>
        <span>${esc(event.detail)} · ${esc(event.actor ?? '后台')}</span></li>`).join('')}</ol>`;
}

export function settlementsPage() {
    const activeId = state.statement?.settlement.id ?? null;
    const header = pageTitle('采购结算 / 扣重结账', '采购结算', '按供货方月度归集已发布验收的超标重量份额，乘磅单净重结出扣重。',
        isPurchaser() ? '<button type="button" class="button primary" id="open-settlement">＋ 新建结算草稿</button>' : '');
    const dialog = isPurchaser() ? newDialog() : '';
    if (!state.statement) {
        return `${header}<div class="work-columns"><section class="block">
            ${empty('还没有选中结算单', isPurchaser() ? '新建一份草稿，或从右侧历史里打开。' : '采购岗建单后可在这里核对。')}
            </section><section class="block aside-block"><header class="block-head"><div><h2>结算单</h2><p>按月份倒序</p></div></header>
            ${statementList(activeId)}</section></div>${dialog}`;
    }
    const {settlement} = state.statement;
    const draft = settlement.status === 'draft';
    return `${header}${statementSummary(settlement)}
        ${state.statement.stale ? `<div class="comparison"><b>草稿已过期</b>
        <p>最新验收或其他结算单已改变本单，重算后为 ${state.statement.fresh_line_count} 笔、
        ${number(amount(state.statement.fresh_totals?.deduction_kg), 3)} kg。请先重算草稿再锁定。</p></div>` : ''}
        ${draft && isPurchaser() ? `<div class="decision-panel"><div><p class="eyebrow">草稿操作</p><h2>核对后再锁定</h2>
        <p>锁定前可重算最新验收；锁定后晚到验收与换版差额随下期补扣或冲回，本期不再改动。</p></div>
        <div class="settlement-actions"><button type="button" class="button secondary" id="refresh-settlement">重算草稿</button>
        <button type="button" class="button primary" id="lock-settlement">锁定结算单</button></div></div>` : ''}
        <div class="work-columns report-columns"><section class="block"><header class="block-head"><div><h2>每批本期扣重</h2>
        <p>本期扣重 = 已发布验收的超标重量份额 × 磅单净重；累计已扣含已锁定各期</p></div>
        <span class="mono">${state.statement.lines.length} 笔</span></header>${linesBlock()}</section>
        <section class="block"><header class="block-head"><div><h2>未列入批次</h2><p>月末未验完可等下期</p></div></header>${pendingBlock()}</section></div>
        <div class="work-columns trace-columns"><section class="block"><header class="block-head"><div><h2>结算历史</h2><p>${esc(settlement.supplier)}</p></div></header>
        ${statementList(activeId)}</section><section class="block"><header class="block-head"><h2>建单与锁定记录</h2></header>${eventsBlock()}</section></div>
        ${dialog}`;
}
