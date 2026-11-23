import {esc, number, pct} from '../../utils/format.js';

export function distribution(points, threshold) {
    const max = Math.min(100, Math.max(5, Math.ceil(Math.max(threshold, points.at(-1).concentration_pct) / 5) * 5));
    const x = value => (value / max) * 100;
    let lastX = 0;
    let lastY = 0;
    const steps = [];
    for (const point of points) {
        const nextX = x(point.concentration_pct);
        const nextY = point.cumulative_pct;
        steps.push(`<i class="chart-horizontal" style="left:${lastX}%;width:${nextX - lastX}%;bottom:${lastY}%"></i>`,
            `<i class="chart-vertical" style="left:${nextX}%;bottom:${lastY}%;height:${nextY - lastY}%"></i>`,
            `<i class="chart-point" style="left:${nextX}%;bottom:${nextY}%" title="${pct(point.concentration_pct)} · 累计 ${pct(nextY)}"></i>`);
        lastX = nextX;
        lastY = nextY;
    }
    steps.push(`<i class="chart-horizontal" style="left:${lastX}%;width:${100 - lastX}%;bottom:${lastY}%"></i>`);
    const ticks = [0, 25, 50, 75, 100];
    return `<figure class="distribution" aria-label="干样重量加权经验分布图">
        <div class="axis-caption">累计干样重量占比</div>
        <div class="chart"><div class="exceed-band" style="left:${x(threshold)}%"></div>
        ${ticks.map(tick => `<span class="gridline" style="bottom:${tick}%"><b>${tick}%</b></span>`).join('')}
        <i class="threshold-line" style="left:${x(threshold)}%"></i>${steps.join('')}
        ${ticks.map(tick => `<span class="x-tick" style="left:${tick}%">${number(max * tick / 100)}%</span>`).join('')}
        </div><figcaption><span><b class="line-key"></b>累计重量</span><span><b class="threshold-key"></b>超标线 ${pct(threshold)}</span><span>单样杂质率 →</span></figcaption>
    </figure>
    <details class="metric-details"><summary>核对 ECDF 节点</summary><div class="table-scroll"><table><thead><tr><th>杂质率</th><th>样号</th><th>累计干样</th><th>累计份额</th></tr></thead>
    <tbody>${points.map(point => `<tr><td>${pct(point.concentration_pct)}</td><td>${point.sample_codes.map(esc).join('、')}</td>
    <td>${number(point.cumulative_g)} g</td><td>${pct(point.cumulative_pct)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
