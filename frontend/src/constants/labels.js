export const roleLabel = {analyst: '称重分析', reviewer: '收料复核', observer: '仓务观察'};
export const outcomeLabel = {accept: '接收', retest: '复检', reject: '退货'};
export const runLabel = {queued: '排队中', succeeded: '已出报告', failed: '样本不足'};
export const actions = {
    lot_created: '登记供货批次', sample_recorded: '记录干样', inspection_queued: '提交诊断',
    inspection_completed: '完成诊断', inspection_failed: '诊断失败', decision_published: '发布验收决定',
};
export const parameterFields = [
    ['threshold_pct', '单样超标线', '杂质率严格高于此线计入超标重量', 3, 0],
    ['tail_pct', '尾部干样份额', '从杂质率最高处逆向累计干样重量', 15, 0.01],
    ['exceed_cap_pct', '超标份额上限', '超标干样重量占总干样重量的上限', 20, 0],
    ['tail_cap_pct', '尾部均值上限', '尾部重量加权平均杂质率的上限', 8, 0],
];
