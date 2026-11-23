import {formError, mark} from '../components/common/presentation.js';

export function loginPage() {
    return `<main class="login-layout"><section class="login-story">
        <div class="login-brand">${mark}<span>棉渡再生 <small>来料质检组</small></span></div>
        <div class="login-message"><p class="eyebrow">再生纤维 / 入厂验收</p><h1>来料杂质<br>长尾验收</h1>
        <p>按干样重量复核来料杂质，把触发退货的后舱抽样留在同一份验收单里。</p></div>
        <div class="swatch-board" aria-hidden="true"><div class="swatch swatch-a"></div><div class="swatch swatch-b"></div><div class="swatch swatch-c"></div></div>
    </section><section class="login-panel"><div class="login-inner">
        <p class="eyebrow">称重工位 · 账号登录</p><h2>进入验收工位</h2>
        <form id="login-form"><label>账号<input name="username" autocomplete="username" required></label>
        <label>口令<input name="password" type="password" autocomplete="current-password" required></label>
        ${formError}<button class="button primary" type="submit">进入台账 <span aria-hidden="true">↗</span></button></form>
        <div class="demo-roles"><p>演示岗位</p><div><button type="button" data-demo="analyst">称重分析</button>
        <button type="button" data-demo="reviewer">收料复核</button><button type="button" data-demo="observer">仓务观察</button></div></div>
    </div></section></main>`;
}
