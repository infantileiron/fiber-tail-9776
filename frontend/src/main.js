import {post, request} from './api/client.js';
import {mark, empty} from './components/common/presentation.js';
import {roleLabel} from './constants/labels.js';
import {notify, submitForm} from './hooks/forms.js';
import {decisionsPage} from './pages/decisions.js';
import {diagnosisPage} from './pages/diagnosis.js';
import {loginPage} from './pages/login.js';
import {lotsPage} from './pages/lots.js';
import {samplesPage} from './pages/samples.js';
import {locationView, route, sections} from './router/location.js';
import {isObserver, login, logout, restore, state} from './stores/workbench.js';
import {RunStatus} from './types/domain.js';
import {esc, version} from './utils/format.js';

const root = document.querySelector('#app');
const pages = {lots: lotsPage, samples: samplesPage, diagnosis: diagnosisPage, decisions: decisionsPage};
const demoPassword = {analyst: 'cotton-scale', reviewer: 'cotton-review', observer: 'cotton-view'};
let revision = 0;
let pollTimer;

function navigate(page, lot, run) {
    const hash = route(page, lot, run);
    if (window.location.hash === hash) load();
    else window.location.hash = hash;
}

function showLogin() {
    root.innerHTML = loginPage();
    for (const button of root.querySelectorAll('[data-demo]')) {
        button.addEventListener('click', () => {
            const form = root.querySelector('#login-form');
            form.elements.username.value = button.dataset.demo;
            form.elements.password.value = demoPassword[button.dataset.demo];
            form.querySelector('[type="submit"]').focus();
        });
    }
    submitForm('#login-form', async values => {
        await login(values);
        navigate('lots');
    });
}

function shell(page, activeLot, content) {
    const current = sections.find(([key]) => key === page)[1];
    root.innerHTML = `<div class="app-shell"><aside class="rail">
        <a class="rail-brand" href="#lots">${mark}<span>棉渡再生<small>来料质检组</small></span></a>
        <nav aria-label="来料验收流程">${sections.map(([key, label], index) => `<a href="${route(key, key === 'lots' ? null : activeLot)}"
        ${page === key ? 'aria-current="page"' : ''}><span aria-hidden="true">0${index + 1}</span>${label}</a>`).join('')}</nav>
        <div class="user-box"><p>${esc(state.user.display_name)}</p><span>${roleLabel[state.user.role]}</span><button id="logout" type="button">退出</button></div></aside>
        <div class="app-main"><header class="topline"><span>入厂验收工作簿 <b>/</b> ${current}</span>
        ${page !== 'lots' && state.lots.length ? `<label class="switch-label">切换批号<select id="lot-switch">${state.lots.map(lot => `<option value="${lot.id}" ${lot.id === activeLot ? 'selected' : ''}>${esc(lot.code)} · ${esc(lot.supplier)}</option>`).join('')}</select></label>` : ''}
        </header><main id="content" class="content">${content}</main></div></div>`;
    document.querySelector('#lot-switch')?.addEventListener('change', event => navigate(page, Number(event.target.value)));
    document.querySelector('#logout').addEventListener('click', endSession);
}

function endSession() {
    revision++;
    clearTimeout(pollTimer);
    logout();
    notify('');
    showLogin();
}

function bindActions() {
    document.querySelector('#open-lot')?.addEventListener('click', () => document.querySelector('#lot-dialog').showModal());
    document.querySelector('#close-lot')?.addEventListener('click', () => document.querySelector('#lot-dialog').close());
    submitForm('#lot-form', async values => {
        const lot = await post('/lots', {...values, shipment_kg: Number(values.shipment_kg)});
        notify(`已登记 ${lot.code}`);
        navigate('samples', lot.id);
    });
    const lot = state.workspace?.lot.id;
    const run = state.report?.id;
    submitForm('#sample-form', async values => {
        await post(`/lots/${lot}/samples`, {...values, dry_g: Number(values.dry_g), impurity_g: Number(values.impurity_g)});
        notify(`已保存干样 ${values.code}`);
        await load({keepPosition: true});
    });
    submitForm('#run-form', async values => {
        const created = await post(`/lots/${lot}/inspections`, values);
        notify(`已提交 ${version(created.version)} 诊断`);
        navigate('diagnosis', lot, created.id);
    });
    submitForm('#decision-form', async values => {
        await post(`/inspections/${run}/decision`, values);
        notify('收料决定已发布');
        await load({keepPosition: true});
    });
    document.querySelector('#export-run')?.addEventListener('click', async () => {
        try {
            await request(`/inspections/${run}/export`, {file: true});
            notify('验收单已导出');
        } catch (error) {
            notify(error.message, true);
        }
    });
}

async function load({keepPosition = false} = {}) {
    clearTimeout(pollTimer);
    if (!state.user) return showLogin();
    const current = ++revision;
    const {page, lotId, runId} = locationView();
    let selected = lotId;
    try {
        const lots = await request('/lots');
        if (current !== revision) return;
        selected ??= lots.find(lot => lot.code === 'MD-1121-03')?.id ?? lots[0]?.id;
        let workspace = null;
        let report = null;
        let audit = [];
        if (page !== 'lots' && selected) {
            workspace = await request(`/lots/${selected}`);
            if (page !== 'samples') {
                const target = runId || workspace.inspections[0]?.id;
                if (target && !workspace.inspections.some(item => item.id === target)) throw new Error('此验收单不在当前批号的可查看版本中。');
                [report, audit] = await Promise.all([
                    target ? request(`/inspections/${target}`) : null,
                    page === 'decisions' && !isObserver() ? request(`/lots/${selected}/audit`) : [],
                ]);
            }
        }
        if (current !== revision) return;
        Object.assign(state, {lots, workspace, report, audit});
        shell(page, selected, pages[page]());
        bindActions();
        if (!keepPosition) window.scrollTo(0, 0);
        if (report?.status === RunStatus.QUEUED) waitForReport(report.id, current);
    } catch (error) {
        if (current !== revision || !state.user) return;
        shell(page, selected, empty('暂时无法打开记录', esc(error.message), '#lots', '返回批号台账') +
            '<p><button type="button" id="retry" class="button secondary">重新加载</button></p>');
        document.querySelector('#retry').addEventListener('click', () => load());
    }
}

function waitForReport(runId, current) {
    pollTimer = setTimeout(async () => {
        try {
            const updated = await request(`/inspections/${runId}`);
            if (current !== revision) return;
            if (updated.status !== RunStatus.QUEUED) await load({keepPosition: true});
            else waitForReport(runId, current);
        } catch (error) {
            if (current !== revision) return;
            notify(error.message, true);
            waitForReport(runId, current);
        }
    }, 700);
}

window.addEventListener('hashchange', () => { notify(''); load(); });
window.addEventListener('fiber-session-expired', endSession);

try {
    await restore();
} catch (error) {
    if (error.status !== 401) notify(error.message, true);
}
await load();
