/* REA workbench UI, embedded in the existing dsh-purge client. */
const __dshPurgeReverse = (() => {
  const React = require("react"), h = React.createElement;
  const { useState, useEffect } = React;
  const PHASES = ["scope","inventory","analysis","validation","report"];
  const LABELS = ["范围","盘点","分析","验证","报告"];
  const CSS = ".dshp-rv{height:100%;min-height:0;overflow:auto;padding:12px;color:var(--dsw-alias-label-primary,#ddd);font:13px/1.55 inherit}.dshp-rv *{box-sizing:border-box}.dshp-rv button,.dshp-rv input,.dshp-rv select{font:inherit}.dshp-rv-header,.dshp-rv-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.dshp-rv-btn{border:1px solid var(--dsw-alias-border-l1,#777);border-radius:7px;padding:5px 9px;background:transparent;color:inherit;cursor:pointer}.dshp-rv-btn:disabled{opacity:.45}.dshp-rv-columns{display:grid;grid-template-columns:minmax(155px,36%) minmax(0,1fr);gap:12px}.dshp-rv-left,.dshp-rv-right{min-width:0}.dshp-rv-input{width:100%;padding:7px;background:var(--dsw-alias-bg-layer-1,transparent);color:inherit;border:1px solid var(--dsw-alias-border-l1,#777);border-radius:6px}.dshp-rv-project{display:block;width:100%;text-align:left;cursor:pointer;background:transparent;color:inherit;border:1px solid transparent;padding:7px;border-radius:6px;overflow-wrap:anywhere}.dshp-rv-project.on{border-color:var(--dsw-alias-brand-primary,#4a9);background:var(--dsw-alias-bg-layer-2,#5553)}.dshp-rv-project strong,.dshp-rv-project small{display:block}.dshp-rv-muted{font-size:11px;color:var(--dsw-alias-label-secondary,#999);overflow-wrap:anywhere}.dshp-rv-steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;margin:10px 0}.dshp-rv-step{border:1px solid var(--dsw-alias-border-l1,#777);border-radius:4px;text-align:center;padding:6px 0;font-size:10px}.dshp-rv-step.done{border-color:var(--dsw-alias-brand-primary,#4a9)}.dshp-rv-step.now{background:var(--dsw-alias-brand-primary,#478);color:white}.dshp-rv-tabs{display:flex;gap:5px;margin:12px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#777)}.dshp-rv-tab{border:0;border-bottom:2px solid transparent;background:transparent;padding:8px;color:inherit;cursor:pointer}.dshp-rv-tab.on{border-color:var(--dsw-alias-brand-primary,#4a9);font-weight:600}.dshp-rv-row{padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l1,#777);overflow-wrap:anywhere}.dshp-rv-code{font:11px/1.5 ui-monospace,Consolas,monospace;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary,#999)}.dshp-rv-select{max-width:100%;padding:5px;background:var(--dsw-alias-bg-layer-1,#333);color:inherit;border:1px solid var(--dsw-alias-border-l1,#777);border-radius:6px}.dshp-rv-report{white-space:pre-wrap;overflow-wrap:anywhere;max-height:400px;overflow:auto;border:1px solid var(--dsw-alias-border-l1,#777);border-radius:7px;padding:9px;background:var(--dsw-alias-bg-layer-2,#5553);font:12px/1.6 ui-monospace,Consolas,monospace}.dshp-rv-error{color:var(--dsw-alias-state-error-primary,#e88);padding:8px}@media(max-width:650px){.dshp-rv-columns{grid-template-columns:1fr}.dshp-rv-left{max-height:165px;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1,#777)}}";
  async function call(op, signal) {
    const r = await fetch("/dsh-purge/reverse/api", {method:"POST",credentials:"same-origin",cache:"no-store",
      headers:{"content-type":"application/json"},body:JSON.stringify(op),signal});
    const body = await r.json();
    if (!r.ok || !body?.ok) throw new Error(body?.error || "读取失败");
    return body;
  }
  function InstallerPanel({onDone}) {
    const [status,setStatus]=useState(null),[plan,setPlan]=useState(null);
    const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
    const [probe,setProbe]=useState(null);
    const refresh=async()=>{try{setStatus(await call({op:"reaStatus"}))}catch(e){setError(e.message)}};
    useEffect(()=>{let active=true;call({op:"reaStatus"}).then(s=>{if(active)setStatus(s)})
      .catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
    const testMcp=async()=>{
      setBusy(true);setError("");setProbe(null);
      try{const result=await call({op:"reaProbe"});setProbe(result)}
      catch(e){setError(e.message)}
      finally{setBusy(false)}
    };
    const preview=async action=>{
      setBusy(true);setError("");setMessage("");setPlan(null);
      try {const p=await call({op:"reaPlan",action});
        if(p.alreadyInstalled)setMessage("已经安装，无需重复安装。");
        else if(p.alreadyUpToDate)setMessage("已是当前插件支持的最新 REA 版本。");
        else if(p.alreadyAbsent)setMessage("当前没有托管安装。");
        else setPlan(p);
      } catch(e){setError(e.message)}finally{setBusy(false)}
    };
    const approve=async()=>{
      if(!plan || busy)return;
      if(!window.confirm("确认执行 "+plan.action+" REA "+plan.version+"？\n此操作会使用 npm 注册表并修改 DSH 专属 runtime；不会全局安装。"))return;
      setBusy(true);setError("");setMessage("");
      try{const result=await call({op:"reaApply",approvalId:plan.approvalId,confirmation:plan.confirmation});
        setMessage(result.note||"操作完成。重新进入逆向 Agent 会话以加载 MCP。");
        setPlan(null);await refresh();onDone?.();
      }catch(e){setError(e.message)}finally{setBusy(false)}
    };
    return h("div",{className:"dshp-rv-row","aria-label":"REA 安装管理"},
      h("div",{className:"dshp-rv-header"},h("strong",null,"REA MCP · 安装管理"),
        h("button",{type:"button",className:"dshp-rv-btn",onClick:refresh},"检查状态")),
      status?h(React.Fragment,null,
        h("div",null,"状态：",status.installed?"已安装":"未安装",
          status.existingUnmanaged?"（非托管目录，禁止覆盖）":""),
        h("div",{className:"dshp-rv-code"},"期望版本：",status.expectedVersion," · 已有版本：",status.version||"无",
          status.updateAvailable?" · 可升级":" · 无可用升级"),
        h("div",{className:"dshp-rv-code"},"Node ",status.nodeVersion,
          status.nodeSupported?" · 符合要求":" · 不符合 REA 版本要求"),
        h("div",{className:"dshp-rv-code"},"独立安装目录：",status.runtime),
        !status.installed&&status.globalExecutable?h("div",{className:"dshp-rv-muted"},"发现系统已安装的 REA：",status.globalExecutable,"。预设会在未托管安装时回退使用。"):null,
        h("p",{className:"dshp-rv-muted"},"安装不会改动系统全局 npm；本面板不代表 REA MCP 已握手成功。")
      ):h("p",{className:"dshp-rv-muted"},"正在检查环境…"),
      h("div",{className:"dshp-rv-header"},
        h("button",{className:"dshp-rv-btn",type:"button",disabled:busy||status?.installed||status?.existingUnmanaged||!status?.nodeSupported,
          onClick:()=>preview("install")},"安装 REA"),
        h("button",{className:"dshp-rv-btn",type:"button",disabled:busy||!status?.installed,
          onClick:()=>preview("repair")},"修复"),
        h("button",{className:"dshp-rv-btn",type:"button",disabled:busy||!status?.updateAvailable,
          onClick:()=>preview("update")},"更新"),
        h("button",{className:"dshp-rv-btn",type:"button",disabled:busy||!status?.managed,
          onClick:()=>preview("uninstall")},"卸载"),
        h("button",{className:"dshp-rv-btn",type:"button",disabled:busy||!status?.installed,
          onClick:testMcp},"测试 MCP")
      ),
      plan?h("section",{className:"dshp-rv-row","aria-label":"安装计划预览"},
        h("strong",null,"待确认：",plan.action," · ",plan.version),
        h("div",{className:"dshp-rv-code"},"目标：",plan.runtime),
        h("pre",{className:"dshp-rv-report"},plan.command.executable+" "+plan.command.args.join(" ")),
        h("p",{className:"dshp-rv-muted"},plan.command.note),
        h("div",{className:"dshp-rv-header"},
          h("button",{className:"dshp-rv-btn",type:"button",disabled:busy,onClick:approve},"确认执行"),
          h("button",{className:"dshp-rv-btn",type:"button",disabled:busy,onClick:()=>setPlan(null)},"取消"))
      ):null,
      busy?h("p",{className:"dshp-rv-muted"},"正在处理，请勿重复操作…"):null,
      error?h("p",{role:"alert",className:"dshp-rv-error"},error):null,
      message?h("p",{role:"status",className:"dshp-rv-muted"},message):null,
      probe?h("div",{className:"dshp-rv-row",role:"status"},
        h("strong",null,probe.connected?"MCP 握手成功":"MCP 未连接"),
        h("div",null,"可发现工具：",probe.toolCount),
        h("div",{className:"dshp-rv-code"},(probe.toolNames||[]).join(", ")),
        h("p",{className:"dshp-rv-muted"},probe.note)
      ):null
    )
  }

  function Panel() {
    const [items,setItems]=useState([]),[count,setCount]=useState(0),[page,setPage]=useState(0);
    const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null);
    const [reports,setReports]=useState([]),[revision,setRevision]=useState("");
    const [report,setReport]=useState(null),[mode,setMode]=useState("stages");
    const [kind,setKind]=useState("all"),[offset,setOffset]=useState(0);
    const [query,setQuery]=useState(""),[refresh,setRefresh]=useState(0);
    const [setup,setSetup]=useState(false);
    const [environment,setEnvironment]=useState(null),[error,setError]=useState("");
    useEffect(()=>{
      const controller=new AbortController();
      call({op:"projects",offset:page,limit:30},controller.signal).then(data=>{
        setItems(data.items||[]);setCount(data.total||0);
        setSelected(old => (data.items||[]).some(x=>x.id===old)?old:(data.items?.[0]?.id||null));
        setError("");
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
      return()=>controller.abort();
    },[page,refresh]);
    useEffect(()=>{
      const controller=new AbortController();
      call({op:"environment"},controller.signal).then(setEnvironment).catch(()=>{});
      return()=>controller.abort();
    },[refresh]);
    useEffect(()=>{
      setDetail(null);setReports([]);setReport(null);setRevision("");
      if(!selected)return undefined;
      const controller=new AbortController();
      Promise.all([call({op:"project",id:selected,offset,limit:20,kind},controller.signal),
        call({op:"reports",id:selected},controller.signal)]).then(([data,list])=>{
        setDetail(data);setReports(list.reports||[]);setError("");
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
      return()=>controller.abort();
    },[selected,kind,offset,refresh]);
    useEffect(()=>{
      if(!selected||!revision)return undefined;
      const controller=new AbortController();
      call({op:"report",id:selected,revision:Number(revision)},controller.signal).then(setReport)
        .catch(e=>{if(!controller.signal.aborted)setError(e.message)});
      return()=>controller.abort();
    },[selected,revision]);
    const choose=id=>{setSelected(id);setMode("stages");setKind("all");setOffset(0);setRevision("");};
    const p=detail?.project, index=p?PHASES.indexOf(p.phase):0;
    const visible=items.filter(x=>(x.target+" "+x.question).toLowerCase().includes(query.toLowerCase()));
    return h("section",{className:"dshp-rv","data-testid":"reverse-workbench"},
      h("header",{className:"dshp-rv-header"},h("div",null,
        h("strong",null,"逆向工程工作台"),h("div",{className:"dshp-rv-muted"},"项目 · 分析阶段 · 证据 · 报告")),
        h("div",{className:"dshp-rv-header"},
          h("button",{type:"button",className:"dshp-rv-btn",onClick:()=>setSetup(x=>!x)},setup?"返回项目":"REA 环境"),
          h("button",{type:"button",className:"dshp-rv-btn",onClick:()=>setRefresh(x=>x+1)},"刷新"))),
      environment?h("div",{className:"dshp-rv-muted"},"Node ",environment.node?.version,
        environment.rea?.found?" · 已找到 REA 命令":" · 未找到 REA 命令"," · MCP 尚未验证"):null,
      error?h("div",{className:"dshp-rv-error",role:"alert"},error):null,
      setup?h(InstallerPanel,{onDone:()=>setRefresh(x=>x+1)}):h("div",{className:"dshp-rv-columns"},
        h("aside",{className:"dshp-rv-left","aria-label":"逆向项目"},
          h("input",{type:"search",className:"dshp-rv-input",placeholder:"筛选当前页项目",value:query,
            onChange:e=>setQuery(e.target.value)}),
          visible.length?visible.map(x=>h("button",{type:"button",key:x.id,
            className:"dshp-rv-project"+(x.id===selected?" on":""),"aria-pressed":x.id===selected,
            onClick:()=>choose(x.id)},h("strong",null,x.target),
            h("small",{className:"dshp-rv-muted"},x.phase+" · "+x.evidenceCount+" 条记录"))):
            h("p",{className:"dshp-rv-muted"},count?"本页没有匹配项目。":"暂无项目，在逆向 Agent 模式开始分析后显示。"),
          count>30?h("div",{className:"dshp-rv-pager"},
            h("button",{type:"button",className:"dshp-rv-btn",disabled:page===0,
              onClick:()=>setPage(x=>Math.max(0,x-30))},"上一页"),
            h("span",{className:"dshp-rv-muted"},(page+1)+"–"+Math.min(page+30,count)+"/"+count),
            h("button",{type:"button",className:"dshp-rv-btn",disabled:page+30>=count,
              onClick:()=>setPage(x=>x+30)},"下一页")):null
        ),
        h("main",{className:"dshp-rv-right"},
          !selected?h("p",{className:"dshp-rv-muted"},"选择项目。"):
          !p?h("p",{className:"dshp-rv-muted"},"正在读取详情…"):
          h(React.Fragment,null,
            h("strong",null,p.id),h("div",{className:"dshp-rv-code"},p.target),
            h("p",{className:"dshp-rv-muted"},p.question),
            h("div",{className:"dshp-rv-steps","aria-label":"逆向进度"},
              PHASES.map((x,i)=>h("span",{key:x,
                className:"dshp-rv-step"+(i<index?" done":i===index?" now":"")},LABELS[i]))),
            h("span",{className:"dshp-rv-muted"},p.evidenceCount+" 条证据 · "+p.checkpointCount+" 个检查点 · r"+p.revision),
            h("div",{className:"dshp-rv-tabs",role:"tablist"},
              [["stages","阶段"],["evidence","证据"],["reports","报告"]].map(([k,label])=>h("button",{
                type:"button",key:k,role:"tab","aria-selected":mode===k,
                className:"dshp-rv-tab"+(mode===k?" on":""),onClick:()=>setMode(k)},label))),
            mode==="stages"?h("div",null,
              detail.checkpoints.length?detail.checkpoints.map((c,i)=>h("div",{className:"dshp-rv-row",key:i},
                h("strong",null,c.completedPhase+" → "+c.nextPhase),h("div",null,c.summary),
                h("div",{className:"dshp-rv-muted"},c.at))):
                h("p",{className:"dshp-rv-muted"},"暂无阶段记录。"),
              h("p",{className:"dshp-rv-muted"},"本面板只读，阶段由逆向 Agent 更新。")):null,
            mode==="evidence"?h("div",null,
              h("select",{className:"dshp-rv-select",value:kind,onChange:e=>{setKind(e.target.value);setOffset(0);},
                "aria-label":"证据类型"},[["all","全部"],["observed","观察"],["inferred","推断"],["unknown","未知"]]
                .map(([v,label])=>h("option",{key:v,value:v},label))),
              detail.evidence.map((e,i)=>h("div",{className:"dshp-rv-row",key:e.id||i},
                h("strong",null,e.kind==="observed"?"观察：":e.kind==="inferred"?"推断：":"未知："),e.summary,
                e.source?.tool?h("div",{className:"dshp-rv-code"},"工具：",e.source.tool):null,
                e.source?.evidenceId?h("div",{className:"dshp-rv-code"},"REA ID：",e.source.evidenceId):null,
                e.source?.location?h("div",{className:"dshp-rv-code"},"位置：",e.source.location):null,
                e.limitation?h("div",{className:"dshp-rv-muted"},"限制：",e.limitation):null)),
              detail.evidence.length===0?h("p",{className:"dshp-rv-muted"},"暂无记录。"):null,
              h("div",{className:"dshp-rv-pager"},
                h("button",{className:"dshp-rv-btn",type:"button",disabled:offset<=0,
                  onClick:()=>setOffset(x=>Math.max(0,x-20))},"上一页"),
                h("span",{className:"dshp-rv-muted"},detail.evidenceTotal?
                  (offset+1)+"–"+(offset+detail.evidence.length)+"/"+detail.evidenceTotal:"0 条"),
                h("button",{className:"dshp-rv-btn",type:"button",disabled:detail.nextOffset==null,
                  onClick:()=>setOffset(detail.nextOffset)},"下一页")),
              h("p",{className:"dshp-rv-muted"},"Agent 登记的笔记，不等于 REA 对证据的独立复核。")):null,
            mode==="reports"?h("div",null,
              h("select",{className:"dshp-rv-select","aria-label":"报告版本",value:revision,
                onChange:e=>{setReport(null);setRevision(e.target.value);}},
                h("option",{value:""},"选择报告"),
                reports.map(x=>h("option",{key:x.revision,value:String(x.revision)},"版本 r"+x.revision))),
              !reports.length?h("p",{className:"dshp-rv-muted"},"暂无报告，让 Agent 使用 reverse_report_export。"):null,
              report?h(React.Fragment,null,
                h("button",{className:"dshp-rv-btn",type:"button",onClick:async()=>{
                  try{await navigator.clipboard.writeText(report.text)}
                  catch{setError("剪贴板权限不足")}
                }},"复制 Markdown"),
                h("pre",{className:"dshp-rv-report"},report.text)):null):null
          )
        )
      )
    );
  }
  return {Panel,CSS};
})();