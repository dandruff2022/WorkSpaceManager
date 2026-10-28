#!/usr/bin/env node
// Static, escaped transcript of one real extension run. No browser-side model-output parsing.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const P = require('../../../utils/workflow_prompts.js');
const dir = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'round3_raw.json'), 'utf8'));
const p = raw.project;
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pre = x => `<pre>${esc(x)}</pre>`;
const details = (title, html, open = false) => `<details${open ? ' open' : ''}><summary>${esc(title)}</summary>${html}</details>`;
const stamp = x => new Date(x).toISOString().replace('T', ' ').replace('Z', ' UTC');
const latest = project => project.memory.at(-1)?.text || '';
const archives = raw.archives;
function answerFor(s) { return archives[s.archiveId]?.text ?? ''; }
// Exact source ranges, not regex replacement over escaped HTML. Context is not mislabeled as user text.
function sent(text) {
  const ranges = [];
  function add(needle, cls) {
    if (!needle) return;
    let at = text.indexOf(needle);
    while (at !== -1) { ranges.push({start:at,end:at+needle.length,cls}); at = text.indexOf(needle,at+needle.length); }
  }
  for (const key of ['split','splitMem','task','result','memUpdate','memStyle','resume','combine']) add(P.TEXT[key], 'wrapper');
  const req = text.match(/^Output requirements:.*(?:\n(?!\n).*)*/m);
  if (req) add(req[0], 'wrapper');
  add(raw.goal, 'user-text');
  const pos = text.indexOf(P.PROGRESS_HEADING);
  if (pos !== -1) ranges.push({start:pos,end:text.length,cls:'progress-text'});
  ranges.sort((a,b)=>a.start-b.start || b.end-a.end);
  let out = '', cursor = 0;
  for (const r of ranges) {
    if (r.start < cursor) continue;
    out += esc(text.slice(cursor,r.start)) + `<span class="${r.cls}">${esc(text.slice(r.start,r.end))}</span>`;
    cursor = r.end;
  }
  return `<pre>${out+esc(text.slice(cursor))}</pre>`;
}
function answer(text) {
  const re = /^(`{3,}|~{3,})(tasks|result|mem)\s*\n[\s\S]*?^\1\s*$/gm;
  let out = '', cursor = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(cursor,m.index)) + `<span class="fence" title="${esc(m[2])} 可解析交接块">${esc(m[0])}</span>`;
    cursor = m.index+m[0].length;
  }
  return `<pre>${out+esc(text.slice(cursor))}</pre>`;
}
function memory(version) {
  if (!version) return '<p class="muted">尚无记忆</p>';
  const i = p.memory.findIndex(v=>v.v===version.v);
  const previous = p.memory[i-1]?.text || '';
  // LCS gives a genuine line diff, including headings and title (not only section bodies).
  const a = previous.split('\n'), b = version.text.split('\n');
  const dp = Array.from({length:a.length+1},()=>new Uint32Array(b.length+1));
  for(let x=a.length-1;x>=0;x--) for(let y=b.length-1;y>=0;y--) dp[x][y]=a[x]===b[y]?1+dp[x+1][y+1]:Math.max(dp[x+1][y],dp[x][y+1]);
  const lines=[]; let x=0,y=0;
  while(x<a.length || y<b.length) {
    if(x<a.length && y<b.length && a[x]===b[y]) {lines.push('  '+esc(b[y++]));x++;}
    else if(y<b.length && (x===a.length || dp[x][y+1]>dp[x+1][y])) lines.push(`<span class="add">+ ${esc(b[y++])}</span>`);
    else lines.push(`<span class="del">− ${esc(a[x++])}</span>`);
  }
  const head = `<p><strong>记忆 v${esc(version.v)}</strong> · ${esc(version.by)}<br><small>${esc(version.note)} · ${esc(stamp(version.at))}</small></p>`;
  return head+details('已存全文 · '+version.text.length+' 字符',pre(version.text),true)+(i>0?details('与 v'+p.memory[i-1].v+' 的逐行差异',`<pre>${lines.join('\n')}</pre>`,true):'');
}
// Prefer real captured snapshots. If a capture precedes another step, fall back to reconstruction explicitly.
function stateAt(time) {
  const clone=JSON.parse(JSON.stringify(p));
  clone.steps=p.steps.filter(s=>s.startedAt<=time).map(s=>({...s,status:s.endedAt && s.endedAt<=time?s.status:'running'}));
  clone.memory=p.memory.filter(v=>v.at<=time);
  const split=p.steps.find(s=>s.kind==='split' && s.status==='done');
  const planned=split && split.endedAt<=time;
  const planSnapshot=raw.snapshots.find(s=>s.moment==='after-plan')?.project;
  clone.tasks=planned?p.tasks.map(t=>{
    const done=p.steps.find(s=>s.taskId===t.id && s.status==='done' && s.endedAt<=time);
    const running=p.steps.find(s=>s.taskId===t.id && s.startedAt<=time && (!s.endedAt || s.endedAt>time));
    const original=planSnapshot?.tasks.find(z=>z.id===t.id);
    return {...t,ai:time===split.endedAt?(original?.ai||t.ai):t.ai,status:done?'done':running?'running':'todo',result:done?t.result:null};
  }):[];
  return clone;
}
const derived=[];
function progress(project,label) {
  const text=P.buildProgress(project), combined=P.withProgress(latest(project),project);
  derived.push({moment:label,source:'reconstructed from persisted timestamps, memory versions and step/task results',progress:text,withProgress:combined});
  return pre(text)+details('阅读 / 插入时：记忆 + Progress（非存储版本）',pre(combined));
}
const names={split:'规划',task:'执行任务',combine:'合并', 'mem-update':'自动更新记忆',resume:'继续'};
const events=[{at:p.createdAt,phase:'create'}];
for(const s of p.steps) {events.push({at:s.startedAt,phase:'send',step:s});if(s.endedAt) events.push({at:s.endedAt,phase:'receive',step:s});}
events.sort((a,b)=>a.at-b.at || (a.phase==='send'?-1:1));
let previousV=-1;
const rows=events.map((e,index)=>{
  const project=stateAt(e.at), v=project.memory.at(-1), s=e.step;
  let manager='', message='', ai='', mem='', prog='';
  if(e.phase==='create') {
    manager='<strong>新建项目（harness）</strong>'+pre(raw.title)+pre(raw.goal)+'<p>Goal 保存为记忆 v0；尚未规划。</p>';
    mem=memory(v); prog=progress(project,'created');
  } else {
    const chore=!!s.parentId;
    const task=p.tasks.find(t=>t.id===s.taskId);
    manager=`<strong>${esc(names[s.kind]||s.kind)}${task?' · '+esc(task.title):''}</strong><p class="meta">${esc(s.kind)} · ${s.temporary?'临时对话':'普通对话'} · ${chore?'后台杂务（无人点击）':'工作步骤'} · ${esc(s.ai)}</p>`;
    if(e.phase==='send') {
      const source=s.kind==='split'||(s.kind==='task'&&s.taskId===p.tasks[0]?.id)?'通过 harness 调用真实 wf_run；使用当前消息构建器。':s.kind==='mem-update'?'Combine 完成后由引擎自动发起；输入包含旧记忆、两个 result 和合并答案。':'在真实 Manager 演示页点击按钮。';
      manager+=`<p>${esc(source)}</p><p>发送 → 等待回答</p>`;
      message=sent(s.message);
      mem='<p class="muted">发送本身不改记忆；当前 v'+esc(v?.v)+'</p>';
    } else {
      manager+=`<p>状态：${esc(s.status)}${s.error?' · '+esc(s.error):''}</p>`;
      if(s.kind==='split') manager+=`<p>解析出 ${p.tasks.length} 个任务。默认分配 ChatGPT / Gemini；本轮在执行前将第二项改为 ChatGPT。</p>`+details('解析后的任务交接数据（规划时）',pre(JSON.stringify(raw.snapshots.find(x=>x.moment==='after-plan')?.project.tasks || p.tasks,null,2)));
      if(s.kind==='task') manager+=details('任务保存的 result（不是整篇回答）',pre(task?.result||'未捕获'));
      if(s.kind==='combine') manager+='<p>普通合并对话保留；自动启动记忆杂务。</p>';
      ai=s.archiveId?details('完整 AI 回答 · '+answerFor(s).length+' 字符',answer(answerFor(s)),answerFor(s).length<800):'<p class="muted">无存档；未捕获，不补写。</p>';
      mem=v?.v!==previousV?memory(v):'<p class="muted">记忆未变，仍为 v'+esc(v?.v)+'。任务结果与进度另存于 project.tasks / steps。</p>';
      prog=progress(project,`${s.kind}:${s.id}:completed`);
    }
  }
  if(v) previousV=v.v;
  return `<tr><th scope="row"><span class="ordinal">${String(index+1).padStart(2,'0')}</span><br>${esc(e.phase==='send'?'发送':e.phase==='receive'?'完成':'创建')}<br><time>${esc(stamp(e.at))}</time></th><td>${manager}</td><td>${message||'<span class="muted">—</span>'}</td><td>${ai||'<span class="muted">—</span>'}</td><td class="memory">${mem}</td><td>${prog||'<span class="muted">本刻未重新展示</span>'}</td></tr>`;
}).join('\n');
const split=p.steps.find(s=>s.kind==='split');
const planMem=split?P.parseMemoryAnswer(answerFor(split),{labelledOnly:true}):null;
const finalMem=latest(p);
const findings=[
  ['计划没有附带 mem',planMem?'本轮规划答案带 mem 块；请检查下面保存版本。':'本轮规划答案只有 tasks，没有 mem；记忆没有在 Plan 后自动增长。'],
  ['任务结束不等于记忆更新',`两个 result 直接保存在任务中；进度由这些字段拼出来，不要求 AI 把任务清单再抄进记忆。`],
  ['合并后才做后台杂务',`${p.steps.filter(s=>s.parentId).length} 次后台 mem-update；输入含两个任务结果和完整合并答案，用户没有额外点击。`],
  ['存档混入了地图界面文字',`合并回答的真实存档末尾还有 canvas、4.3 / 4.4 / 5.0 / 4.7 和地图操作提示。这里原样保留；这些文字也作为合并答案进入了记忆更新输入。`],
  ['记忆与 Progress 分开',`最终记忆 ${finalMem.length} 字符、${finalMem.split('\n').length} 行；共 ${p.memory.length} 个版本。Progress 的 Done 摘要只取 result 首个非标题/围栏行；本轮是任务名称，没有带出 560 / 200 元预算。`]
];
const html=`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>第三轮实测 · Projects 文本流</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
:root{color-scheme:light dark;--bg:#f6f7f9;--panel:#fff;--fg:#1d2330;--muted:#526074;--line:#dfe3ea;--code:#f3f4f7;--wrap:#ecebfd;--user:#fff0cb;--mem:#f2f0ff;--add:#146447;--del:#aa2920;--block:#e3f4ee;--accent:#4f46e5}
@media(prefers-color-scheme:dark){:root{--bg:#13151b;--panel:#1b1e26;--fg:#e6e8ee;--muted:#b0b9c9;--line:#3a4050;--code:#22252e;--wrap:#353153;--user:#51401b;--mem:#242137;--add:#80dfb4;--del:#ffa199;--block:#19392d;--accent:#aaa4ff}}
:root:has(#theme-light:checked){color-scheme:light;--bg:#f6f7f9;--panel:#fff;--fg:#1d2330;--muted:#526074;--line:#dfe3ea;--code:#f3f4f7;--wrap:#ecebfd;--user:#fff0cb;--mem:#f2f0ff;--add:#146447;--del:#aa2920;--block:#e3f4ee;--accent:#4f46e5}
:root:has(#theme-dark:checked){color-scheme:dark;--bg:#13151b;--panel:#1b1e26;--fg:#e6e8ee;--muted:#b0b9c9;--line:#3a4050;--code:#22252e;--wrap:#353153;--user:#51401b;--mem:#242137;--add:#80dfb4;--del:#ffa199;--block:#19392d;--accent:#aaa4ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 "IBM Plex Sans",-apple-system,"PingFang SC",sans-serif}.page{padding:30px 20px 60px;max-width:1880px;margin:auto}h1{font-size:26px;margin:0 0 8px}h2{font-size:15px;margin:0}p{margin:6px 0 12px}.sub,.muted,small,.meta,time{color:var(--muted)}.sub{max-width:100ch}.theme{display:flex;gap:12px;margin:16px 0}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:22px 0}.card{padding:16px;border:1px solid var(--line);border-radius:8px;background:var(--panel)}.card p{margin:8px 0 0;color:var(--muted)}.legend{display:flex;flex-wrap:wrap;gap:8px 18px;margin:20px 0}.legend span{padding:3px 8px;border-radius:4px}.wrapper{background:var(--wrap);border-left:2px solid var(--accent)}.user-text{background:var(--user);text-decoration:underline;text-decoration-style:dotted}.fence,.progress-text{background:var(--block);border-left:2px solid var(--add)}.add{color:var(--add)}.del{color:var(--del);text-decoration:line-through}.scroll{overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel)}table{width:100%;min-width:1500px;border-collapse:collapse;table-layout:fixed}col.moment{width:110px}col.manager{width:210px}col.message{width:340px}col.answer{width:310px}col.memory{width:300px}col.progress{width:290px}th,td{padding:12px;vertical-align:top;text-align:left;border-bottom:1px solid var(--line);border-right:1px solid var(--line);overflow-wrap:anywhere}thead th{background:var(--code);font-size:14px}tbody th{font-size:12px;font-weight:400}.ordinal{font-size:20px;font-weight:600}.memory{background:var(--mem)}time{font-size:10px;line-height:1.5}pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:12px/1.65 "IBM Plex Mono",ui-monospace,"PingFang SC",monospace;background:var(--code);padding:10px;border-radius:5px;margin:8px 0}pre span{box-decoration-break:clone;-webkit-box-decoration-break:clone}summary{cursor:pointer;font-size:12px;font-weight:600;padding:6px 0}summary:hover{text-decoration:underline}details{margin:6px 0}.foot{margin:22px 0;max-width:100ch}.chat-list a{color:var(--accent)}@media print{details{display:block}.scroll{overflow:visible}table{min-width:0}pre{font-size:8px}.theme{display:none}}
</style></head><body><main class="page"><h1>第三轮实测：每一段文字，去了哪里</h1><p class="sub">${esc(p.title)} · 单次真实 ChatGPT 运行。原文不删节，长回答可展开；时间按 UTC。${p.steps.length} 个步骤 / ${p.steps.length} 个新对话（不含只读查看页）。</p>
<div class="theme" role="group" aria-label="配色"><label><input type="radio" name="theme" id="theme-auto" checked> 跟随系统</label><label><input type="radio" name="theme" id="theme-light"> 浅色</label><label><input type="radio" name="theme" id="theme-dark"> 深色</label></div>
<div class="cards">${findings.map(([title,text])=>`<article class="card"><h2>${esc(title)}</h2><p>${esc(text)}</p></article>`).join('')}</div>
<div class="legend" aria-label="图例"><span class="user-text">点状下划线：本轮用户目标原文</span><span class="wrapper">左侧竖线 / 紫底：扩展附加指令</span><span class="fence">绿底：AI 可解析围栏块</span><span class="add">+ 新增记忆行</span><span class="del">− 删除记忆行</span><span>普通底：上下文 / AI 派生任务与结果</span></div>
<p class="sub">Manager 栏将英文界面动作解释成中文。Plan、第一项任务与创建走真实 harness API；第二项任务、Combine 走真实 Manager 按钮。Progress 是用项目时间戳重建的各时刻派生值，不冒充历史截图或已保存的记忆。没有运行 Continue 或手动整理。</p>
<div class="scroll" tabindex="0" aria-label="可横向滚动的文本流时间线"><table><colgroup><col class="moment"><col class="manager"><col class="message"><col class="answer"><col class="memory"><col class="progress"></colgroup><thead><tr><th scope="col">时刻</th><th scope="col">Manager<br><small>用户动作 / 所见</small></th><th scope="col">发给 AI 的消息<br><small>完整存储文本</small></th><th scope="col">AI 回答<br><small>来自扩展存档</small></th><th scope="col">Memory<br><small>实际持久化版本</small></th><th scope="col">Progress<br><small>派生，不存储</small></th></tr></thead><tbody>${rows}</tbody></table></div>
<section class="foot"><h2>捕获范围与限制</h2><p>${esc((raw.limitations||[]).join(' '))}</p><p>原始数据：round3_raw.json；生成器：build_round3.js。全部外来文本在构建时 HTML 转义；页面没有脚本，也不在运行时把模型文本放入 innerHTML。</p><h2>本轮对话</h2><ul class="chat-list">${(raw.chats||[]).map(c=>`<li>${esc(c.kind)} · ${c.temporary?'临时':'普通'} · ${esc(c.title||'网页标题未捕获')} ${c.url?`<a href="${esc(c.url)}" rel="noreferrer">对话链接</a>`:''}</li>`).join('')}</ul></section>
</main></body></html>`;
// Keep both functions' exact derived text alongside the original extension capture.
raw.derived={method:'Node WorkflowPrompts.buildProgress / withProgress; historical states reconstructed from persisted timestamps, plan snapshot and final task results',snapshots:derived,final:{progress:P.buildProgress(p),withProgress:P.withProgress(finalMem,p)}};
fs.writeFileSync(path.join(dir,'round3_raw.json'),JSON.stringify(raw,null,2)+'\n');
fs.writeFileSync(path.join(dir,'flow_round3.html'),html);
assert(!/<script\b/i.test(html),'The transcript must be script-free');
assert(!html.includes('undefined'),'No undefined placeholders');
for(const s of p.steps) {
  assert.equal(sent(s.message).replace(/<[^>]*>/g, ''), esc(s.message), 'Message must be fully preserved after removing presentation markup');
}
console.log(`Built ${events.length} timeline rows, ${p.steps.length} steps, ${Object.keys(archives).length} archives, ${p.memory.length} memory versions; ${html.length} HTML characters.`);
