// Baker v2 — mirrors the index-test.html (Codex-improved) generator.
// Adds: braid scoring, internal detours, dense fill, head extension.
// Output: window.BAKED_LEVELS = [...] for levels 1..N.

const DX=[1,0,-1,0], DY=[0,-1,0,1];
const min=Math.min, max=Math.max, floor=Math.floor, abs=Math.abs;
const lrp=(a,b,t)=>a+(b-a)*t;
const pow=Math.pow;

let _clusterCenters=[];
let _maxBlockers=1;
let _levelPattern=null;
let _lockHeadBonus=34;
let _lockHeadPenalty=16;

// Visual level patterns. These bias only the board shape: cluster attractors,
// head preference, body growth and length mix. Escape rules, _maxBlockers,
// chain dependencies, penetration bonus and solvability checks stay intact.
const LEVEL_PATTERNS=[
  {id:'braid',name:'Classic braid',lenScale:1,clusterScale:1,longMinScale:1},
  {id:'spiral',name:'Spiral coil',lenScale:1.08,clusterScale:1.15,longMinScale:1.04},
  {id:'mosaic',name:'Mosaic tiles',lenScale:.62,clusterScale:1.75,longMinScale:.72},
  {id:'piton',name:'Big pitons',lenScale:1.38,clusterScale:.45,longMinScale:1.28},
  {id:'diagonal',name:'Diagonal weave',lenScale:1.04,clusterScale:1.15,longMinScale:1},
  {id:'rings',name:'Concentric rings',lenScale:1.1,clusterScale:1.25,longMinScale:1.04},
  {id:'maze',name:'Maze rows',lenScale:.92,clusterScale:1.35,longMinScale:.9},
  {id:'rays',name:'Center rays',lenScale:1.02,clusterScale:1.2,longMinScale:1}
];

function getLevelPattern(lvl){
  if(lvl<=3)return LEVEL_PATTERNS[0];
  // Seven-level chapters create the "new pattern arrived" feeling without
  // making every level look randomly unrelated.
  return LEVEL_PATTERNS[Math.floor((lvl-4)/7)%LEVEL_PATTERNS.length];
}

function buildPatternCenters(pattern,rows,cols,numClusters,rng){
  const centers=[];
  const cR=(rows-1)/2,cC=(cols-1)/2;
  const maxRad=Math.max(2,Math.min(rows,cols)*.47);
  const push=(r,c)=>centers.push({
    r:Math.max(1,Math.min(rows-2,Math.round(r))),
    c:Math.max(1,Math.min(cols-2,Math.round(c)))
  });

  if(pattern.id==='spiral'){
    // Spiral coil: attractors crawl around the center with increasing radius.
    for(let i=0;i<numClusters;i++){
      const t=i/Math.max(1,numClusters-1);
      const a=t*Math.PI*5.4+rng()*.5;
      const rad=maxRad*(.12+.82*t);
      push(cR+Math.sin(a)*rad,cC+Math.cos(a)*rad);
    }
  }else if(pattern.id==='mosaic'){
    // Mosaic tiles: evenly spaced anchors produce short repeated blocks.
    const bands=Math.max(2,Math.round(Math.sqrt(numClusters)));
    for(let r=0;r<bands&&centers.length<numClusters;r++){
      for(let c=0;c<bands&&centers.length<numClusters;c++){
        push((r+.5)/bands*rows,(c+.5)/bands*cols);
      }
    }
  }else if(pattern.id==='piton'){
    // Big pitons: few central anchors make 1-2 dominant snakes per board.
    const n=Math.max(2,Math.round(numClusters*.45));
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2+rng()*.45;
      const rad=maxRad*(.12+.26*rng());
      push(cR+Math.sin(a)*rad,cC+Math.cos(a)*rad);
    }
  }else if(pattern.id==='diagonal'){
    // Diagonal weave: alternating diagonal anchors across the grid.
    for(let i=0;i<numClusters;i++){
      const t=(i+.5)/numClusters;
      const flip=i%2===0;
      push(t*rows,flip?t*cols:(1-t)*cols);
    }
  }else if(pattern.id==='rings'){
    // Concentric rings: nested radius bands around the center.
    const ringCount=Math.max(2,Math.min(5,Math.round(Math.sqrt(numClusters))));
    for(let i=0;i<numClusters;i++){
      const ring=i%ringCount;
      const a=(i/ringCount)*Math.PI*.9+rng()*.35;
      const rad=maxRad*(.18+.75*(ring/(ringCount-1||1)));
      push(cR+Math.sin(a)*rad,cC+Math.cos(a)*rad);
    }
  }else if(pattern.id==='maze'){
    // Maze rows: alternating horizontal lanes like compact zigzag rows.
    for(let i=0;i<numClusters;i++){
      const row=(i+.5)/numClusters*rows;
      const c=(i%2===0)?.25*cols:.75*cols;
      push(row,c+(rng()-.5)*cols*.12);
    }
  }else if(pattern.id==='rays'){
    // Center rays: spoke anchors radiate from center to edges.
    const spokes=8;
    for(let i=0;i<numClusters;i++){
      const spoke=i%spokes;
      const a=spoke/spokes*Math.PI*2;
      const rad=maxRad*(.2+.72*((Math.floor(i/spokes)+1)/(Math.ceil(numClusters/spokes)+1)));
      push(cR+Math.sin(a)*rad,cC+Math.cos(a)*rad);
    }
  }else{
    for(let i=0;i<numClusters;i++){
      const baseR=floor((i+.5)/numClusters*rows);
      const baseC=floor((.3+.4*rng())*cols);
      push(baseR,baseC);
    }
  }
  return centers;
}

function patternCellBias(r,c,d,rows,cols,isHead){
  const pattern=_levelPattern;
  if(!pattern)return 0;
  const id=pattern.id;
  const cR=(rows-1)/2,cC=(cols-1)/2;
  const rr=r-cR,cc=c-cC;
  const rad=Math.sqrt(rr*rr+cc*cc);
  const maxRad=Math.max(1,Math.sqrt(cR*cR+cC*cC));
  let s=0;

  if(id==='spiral'){
    const a=Math.atan2(rr,cc);
    const spiral=(a+Math.PI)/(Math.PI*2)+rad/maxRad*1.65;
    s+=Math.cos(spiral*Math.PI*2)*3.2;
  }else if(id==='mosaic'){
    const tile=4;
    const nearR=Math.min(r%tile,tile-r%tile);
    const nearC=Math.min(c%tile,tile-c%tile);
    s+=(2.5-Math.min(nearR,nearC))*(isHead?2.2:1.1);
  }else if(id==='piton'){
    s+=(1-rad/maxRad)*(isHead?6:2.8);
  }else if(id==='diagonal'){
    const band1=Math.abs((r/(rows-1||1))-(c/(cols-1||1)));
    const band2=Math.abs((r/(rows-1||1))-(1-c/(cols-1||1)));
    s+=(1-Math.min(band1,band2))*3.6;
    if((d===0||d===2)&&Math.abs(rr)>Math.abs(cc)*.65)s+=1.1;
    if((d===1||d===3)&&Math.abs(cc)>Math.abs(rr)*.65)s+=1.1;
  }else if(id==='rings'){
    const bands=4;
    const x=(rad/maxRad)*bands;
    const near=Math.abs(x-Math.round(x));
    s+=(.5-near)*4.8;
  }else if(id==='maze'){
    const rowBand=Math.abs((r%4)-1.5);
    s+=(1.5-rowBand)*2.2;
    if(d===0||d===2)s+=isHead?1.5:2.4;
  }else if(id==='rays'){
    const ang=Math.atan2(rr,cc);
    const spoke=Math.round(ang/(Math.PI/4))*(Math.PI/4);
    s+=Math.cos(ang-spoke)*3.2;
    if(isHead){
      const outward=(Math.abs(cc)>Math.abs(rr))?(cc>=0?0:2):(rr>=0?3:1);
      if(d===outward)s+=4.8;
    }
  }
  return s;
}

function seededRandom(seed){
  let s=seed;
  return()=>{s=(s*16807)%2147483647;return(s-1)/2147483646};
}

function onEscapeLine(r,c,hr,hc,dir,rows,cols){
  let cr=hr+DY[dir], cc=hc+DX[dir];
  while(cr>=0&&cr<rows&&cc>=0&&cc<cols){
    if(cr===r&&cc===c)return true;
    cr+=DY[dir]; cc+=DX[dir];
  }
  return false;
}

function tryBuildArrow(occ,rows,cols,rng,minLen,maxLen,placed,opts){
  opts=opts||{};
  const oneCell=(minLen===1&&maxLen===1);
  const minAcceptLen=opts.minAcceptLen||minLen;
  const braidMode=opts.braid!==false;
  const candidates=[];
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      if(occ[r][c]!==-1)continue;
      for(let d=0;d<4;d++){
        if(!oneCell){
          const bd=(d+2)%4;
          const br=r+DY[bd],bc=c+DX[bd];
          if(br<0||br>=rows||bc<0||bc>=cols)continue;
          if(occ[br][bc]!==-1)continue;
        }
        // Allow up to 1 blocker on the escape line — chain dependency.
        let blockerCount=0;
        let escLen=0;
        let cr=r+DY[d],cc=c+DX[d];
        while(cr>=0&&cr<rows&&cc>=0&&cc<cols){
          if(occ[cr][cc]!==-1)blockerCount++;
          escLen++;
          cr+=DY[d];cc+=DX[d];
        }
        if(blockerCount>_maxBlockers)continue;
        let s=rng();
        const adjArrows=new Set();
        for(let dd=0;dd<4;dd++){
          const nr=r+DY[dd],nc=c+DX[dd];
          if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&occ[nr][nc]!==-1){
            s+=braidMode?7.0:3.5;
            adjArrows.add(occ[nr][nc]);
            if(placed&&placed[occ[nr][nc]]&&placed[occ[nr][nc]].dir===d)s-=8.0;
          }
        }
        if(braidMode)s+=adjArrows.size*2.0;
        const cR=(rows-1)/2,cC=(cols-1)/2;
        const distCenter=max(abs(r-cR),abs(c-cC));
        s-=distCenter*.12;
        // Variant D — chain bonus: longer escape line = more dependency chain
        s+=escLen*4;
        // Real-puzzle bonus: prefer heads whose exit is blocked by exactly
        // one already placed arrow. Solvability filtering later rejects
        // cycles, but this makes the generator actively build locks instead
        // of mostly independent snakes.
        if(placed&&placed.length>4){
          if(blockerCount===1)s+=_lockHeadBonus;
          else s-=_lockHeadPenalty;
        }
        // Direction-variance bonus
        if(placed&&placed.length>3){
          const dirCounts=[0,0,0,0];
          for(const o of placed)dirCounts[o.dir]++;
          let minC=dirCounts[0],maxC=dirCounts[0];
          for(let dd=1;dd<4;dd++){
            if(dirCounts[dd]<minC)minC=dirCounts[dd];
            if(dirCounts[dd]>maxC)maxC=dirCounts[dd];
          }
          if(dirCounts[d]===minC&&maxC>minC)s+=7;
          else if(dirCounts[d]===maxC&&maxC>minC+1)s-=5;
        }
        // Variant E — clusters: pull head toward nearest cluster center
        if(_clusterCenters&&_clusterCenters.length){
          let minD=Infinity;
          for(const cc of _clusterCenters){
            const dd=max(abs(r-cc.r),abs(c-cc.c));
            if(dd<minD)minD=dd;
          }
          s-=minD*.5;
        }
        s+=patternCellBias(r,c,d,rows,cols,true);
        candidates.push({hr:r,hc:c,dir:d,s});
      }
    }
  }
  if(!candidates.length)return null;
  candidates.sort((a,b)=>b.s-a.s);
  if(oneCell){
    const best=candidates[0];
    return {cells:[[best.hr,best.hc]],dir:best.dir};
  }
  for(const cand of candidates){
    const{hr,hc,dir}=cand;
    const bd=(dir+2)%4;
    const br0=hr+DY[bd],bc0=hc+DX[bd];
    const targetLen=maxLen;
    const cells=[[br0,bc0],[hr,hc]];
    const used=new Set();
    used.add(hr+','+hc);
    used.add(br0+','+bc0);
    let br=br0,bc=bc0;
    let lastStepDir=bd;
    let straightRun=1;
    let turnCount=0;
    while(cells.length<targetLen){
      const opts=[];
      for(let d=0;d<4;d++){
        const nr=br+DY[d],nc=bc+DX[d];
        if(nr<0||nr>=rows||nc<0||nc>=cols)continue;
        if(occ[nr][nc]!==-1)continue;
        if(used.has(nr+','+nc))continue;
        if(onEscapeLine(nr,nc,hr,hc,dir,rows,cols))continue;
        opts.push({r:nr,c:nc,d});
      }
      if(!opts.length)break;
      const filteredOpts=opts.filter(o=>!(o.d===lastStepDir&&straightRun>=2));
      const useOpts=filteredOpts.length?filteredOpts:opts;
      const scored=useOpts.map(({r,c,d})=>{
        let s=rng();
        let occupied=[false,false,false,false];
        const adjArrows=new Set();
        for(let dd=0;dd<4;dd++){
          const nr=r+DY[dd],nc=c+DX[dd];
          if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&occ[nr][nc]!==-1){
            s+=braidMode?6.0:4.0;
            occupied[dd]=true;
            adjArrows.add(occ[nr][nc]);
          }
        }
        if(braidMode)s+=adjArrows.size*1.8;
        if(occupied[0]&&occupied[2])s+=braidMode?7.0:2.5;
        if(occupied[1]&&occupied[3])s+=braidMode?7.0:2.5;
        if(braidMode&&(d===0||d===2)&&(occupied[1]||occupied[3]))s+=3.8;
        if(braidMode&&(d===1||d===3)&&(occupied[0]||occupied[2]))s+=3.8;
        if(braidMode&&placed&&placed.length>0&&adjArrows.size===0&&cells.length>4)s-=3.0;
        if(d!==lastStepDir)s+=2.0;
        else if(straightRun>=2)s-=2.0;
        // Variant D — bonus if cell crosses an earlier-placed arrow's escape line
        if(placed){
          let crossings=0;
          for(let j=0;j<placed.length;j++){
            const o=placed[j];
            const oh=o.cells[o.cells.length-1];
            if(onEscapeLine(r,c,oh[0],oh[1],o.dir,rows,cols))crossings++;
          }
          s+=crossings*20;
        }
        // Penetration bonus — cells in tight pockets get strong bonus
        let surroundedBy=0;
        for(let dd=0;dd<4;dd++){
          const nr2=r+DY[dd],nc2=c+DX[dd];
          if(nr2<0||nr2>=rows||nc2<0||nc2>=cols)surroundedBy++;
          else if(occ[nr2][nc2]!==-1)surroundedBy++;
        }
        if(surroundedBy>=3)s+=14;
        else if(surroundedBy>=2)s+=4;
        // Variant E — pull body toward nearest cluster center
        if(_clusterCenters&&_clusterCenters.length){
          let minD=Infinity;
          for(const cc of _clusterCenters){
            const dd=max(abs(r-cc.r),abs(c-cc.c));
            if(dd<minD)minD=dd;
          }
          s-=minD*.4;
        }
        s+=patternCellBias(r,c,d,rows,cols,false);
        return {cell:[r,c],d,s};
      });
      scored.sort((a,b)=>b.s-a.s);
      const pick=scored[0];
      cells.unshift(pick.cell);
      used.add(pick.cell[0]+','+pick.cell[1]);
      br=pick.cell[0];bc=pick.cell[1];
      if(pick.d===lastStepDir)straightRun++;
      else{straightRun=1;lastStepDir=pick.d;turnCount++}
    }
    if(cells.length>5&&turnCount<2)continue;
    if(cells.length>=minAcceptLen)return {cells,dir};
  }
  return null;
}

function generateLevel(lvl, customSeed){
  const rng=seededRandom(customSeed!=null?customSeed:(lvl*7919+31337));
  const p=min(1, pow((lvl-1)/74, .66));
  // Tutorial override: lvls 1-5 use tiny hand-picked grids (3-10 arrows).
  const TUT_OVERRIDES=[
    {cols:6,rows:8, maxLen:14, longMin:5},
    {cols:7,rows:10,maxLen:18, longMin:6},
    {cols:8,rows:12,maxLen:22, longMin:7},
    {cols:10,rows:14,maxLen:26,longMin:8},
    {cols:12,rows:16,maxLen:30,longMin:10},
  ];
  const tut=lvl<=5?TUT_OVERRIDES[lvl-1]:null;
  const cols=tut?tut.cols:floor(lrp(14,32,p)+.5);
  const rows=tut?tut.rows:floor(lrp(19,42,p)+.5);
  const pattern=getLevelPattern(lvl);
  _levelPattern=pattern;
  const minLen=2;
  // Reduced max from 108 → 35: competitor reference shows mostly short-
  // medium arrows (3-15 cells) packed densely, never giant 100-cell
  // serpents. This gives 30-50 short arrows per board → maze look.
  const maxLen=tut?tut.maxLen:floor(lrp(15,60,p)*pattern.lenScale+.5);

  // Tutorial: no chain blockers. Otherwise late-level scaling kicks in.
  _maxBlockers=tut?0:1;
  let numClusters,lateExtra;
  if(lvl<=1500){
    const q=Math.max(0,(lvl-75)/1425);
    numClusters=floor(lrp(3,12,q)+.5);
    lateExtra=q;
  }else{
    numClusters=12+floor((lvl-1500)/25);
    lateExtra=1+(lvl-1500)/2000;
  }
  numClusters=Math.min(24,numClusters);
  lateExtra=Math.min(2.5,lateExtra);

  numClusters=Math.max(2,Math.round(numClusters*pattern.clusterScale));
  _clusterCenters=buildPatternCenters(pattern,rows,cols,numClusters,rng);

  const occ=[];
  for(let r=0;r<rows;r++){occ[r]=[];for(let c=0;c<cols;c++)occ[r][c]=-1}
  const placed=[];

  // ONE PASS: only long substantial snakes. Pass 3 mops up empty cells.
  // longMin shrinks at lvl 1500+ for more arrows per board.
  let safety=3000;
  const longMinBase=floor(maxLen*lrp(.55,.70,p)*pattern.longMinScale);
  const longMin=tut?tut.longMin:max(15,floor(longMinBase*max(0.45,1-lateExtra*0.30)));
  while(safety-->0){
    const arrow=tryBuildArrow(occ,rows,cols,rng,minLen,maxLen,placed,{minAcceptLen:longMin});
    if(!arrow)break;
    for(const[r,c] of arrow.cells)occ[r][c]=placed.length;
    placed.push(arrow);
  }

  const _wouldBlockOtherEscape=(r,c,currentIdx)=>{
    for(let j=currentIdx+1;j<placed.length;j++){
      const o=placed[j];
      const h=o.cells[o.cells.length-1];
      if(onEscapeLine(r,c,h[0],h[1],o.dir,rows,cols))return true;
    }
    return false;
  };

  // 3a tail extension
  let absorbed=1;
  while(absorbed>0){
    absorbed=0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(occ[r][c]!==-1)continue;
        for(let d=0;d<4;d++){
          const nr=r+DY[d],nc=c+DX[d];
          if(nr<0||nr>=rows||nc<0||nc>=cols)continue;
          if(occ[nr][nc]===-1)continue;
          const arrowIdx=occ[nr][nc];
          const arrow=placed[arrowIdx];
          const tail=arrow.cells[0];
          if(tail[0]!==nr||tail[1]!==nc)continue;
          const head=arrow.cells[arrow.cells.length-1];
          if(onEscapeLine(r,c,head[0],head[1],arrow.dir,rows,cols))continue;
          if(_wouldBlockOtherEscape(r,c,arrowIdx))continue;
          arrow.cells.unshift([r,c]);
          occ[r][c]=arrowIdx;
          absorbed++;
          break;
        }
      }
    }
  }

  // 3b head extension
  let extended=1;
  while(extended>0){
    extended=0;
    for(let i=0;i<placed.length;i++){
      const a=placed[i];
      if(a.cells.length===1)continue;
      const head=a.cells[a.cells.length-1];
      const fr=head[0]+DY[a.dir],fc=head[1]+DX[a.dir];
      if(fr<0||fr>=rows||fc<0||fc>=cols)continue;
      if(occ[fr][fc]!==-1)continue;
      if(_wouldBlockOtherEscape(fr,fc,i))continue;
      a.cells.push([fr,fc]);
      occ[fr][fc]=i;
      extended++;
    }
  }

  // 3c small gap (3-8, then 2-5)
  safety=3000;
  while(safety-->0){
    const arrow=tryBuildArrow(occ,rows,cols,rng,3,8,placed,{minAcceptLen:3,braid:false});
    if(!arrow)break;
    for(const[r,c] of arrow.cells)occ[r][c]=placed.length;
    placed.push(arrow);
  }
  safety=3000;
  while(safety-->0){
    const arrow=tryBuildArrow(occ,rows,cols,rng,2,5,placed,{minAcceptLen:2,braid:false});
    if(!arrow)break;
    for(const[r,c] of arrow.cells)occ[r][c]=placed.length;
    placed.push(arrow);
  }

  // Dense fill
  safety=5000;
  while(safety-->0){
    const arrow=tryBuildArrow(occ,rows,cols,rng,2,4,placed,{minAcceptLen:2,braid:false});
    if(!arrow)break;
    for(const[r,c] of arrow.cells)occ[r][c]=placed.length;
    placed.push(arrow);
  }

  // Re-run absorption and head extension
  absorbed=1;
  while(absorbed>0){
    absorbed=0;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        if(occ[r][c]!==-1)continue;
        for(let d=0;d<4;d++){
          const nr=r+DY[d],nc=c+DX[d];
          if(nr<0||nr>=rows||nc<0||nc>=cols)continue;
          if(occ[nr][nc]===-1)continue;
          const arrowIdx=occ[nr][nc];
          const arrow=placed[arrowIdx];
          const tail=arrow.cells[0];
          if(tail[0]!==nr||tail[1]!==nc)continue;
          const head=arrow.cells[arrow.cells.length-1];
          if(onEscapeLine(r,c,head[0],head[1],arrow.dir,rows,cols))continue;
          if(_wouldBlockOtherEscape(r,c,arrowIdx))continue;
          arrow.cells.unshift([r,c]);
          occ[r][c]=arrowIdx;
          absorbed++;
          break;
        }
      }
    }
  }
  extended=1;
  while(extended>0){
    extended=0;
    for(let i=0;i<placed.length;i++){
      const a=placed[i];
      if(a.cells.length===1)continue;
      const head=a.cells[a.cells.length-1];
      const fr=head[0]+DY[a.dir],fc=head[1]+DX[a.dir];
      if(fr<0||fr>=rows||fc<0||fc>=cols)continue;
      if(occ[fr][fc]!==-1)continue;
      if(_wouldBlockOtherEscape(fr,fc,i))continue;
      a.cells.push([fr,fc]);
      occ[fr][fc]=i;
      extended++;
    }
  }

  // 3d internal detours — 50% per-arrow budget + 35% segment skip
  // (v1.0.15 tuning: less zigzag spaghetti, more space for chain interaction).
  const _detourBudget=new Array(placed.length);
  for(let i=0;i<placed.length;i++){
    _detourBudget[i]=Math.max(0, Math.floor((placed[i].cells.length-1)*0.12));
  }
  let detoured=1;
  while(detoured>0){
    detoured=0;
    for(let i=0;i<placed.length;i++){
      const a=placed[i];
      if(a.cells.length<2)continue;
      if(_detourBudget[i]<=0)continue;
      // BUG FIX: skip the LAST segment so the arrowhead always points in
      // arrow.dir. Detour at k=N-2 would route the last segment sideways
      // and the visual head would no longer match the actual escape dir.
      for(let k=0;k<a.cells.length-2;k++){
        if(rng()<0.70)continue;
        const p0=a.cells[k],p1=a.cells[k+1];
        const dr=p1[0]-p0[0],dc=p1[1]-p0[1];
        const sides=(dr!==0)?[[0,1],[0,-1]]:[[1,0],[-1,0]];
        let did=false;
        for(const[sr,sc] of sides){
          const r0=p0[0]+sr,c0=p0[1]+sc;
          const r1=p1[0]+sr,c1=p1[1]+sc;
          if(r0<0||r0>=rows||c0<0||c0>=cols)continue;
          if(r1<0||r1>=rows||c1<0||c1>=cols)continue;
          if(occ[r0][c0]!==-1||occ[r1][c1]!==-1)continue;
          const head=a.cells[a.cells.length-1];
          if(onEscapeLine(r0,c0,head[0],head[1],a.dir,rows,cols))continue;
          if(onEscapeLine(r1,c1,head[0],head[1],a.dir,rows,cols))continue;
          if(_wouldBlockOtherEscape(r0,c0,i)||_wouldBlockOtherEscape(r1,c1,i))continue;
          a.cells.splice(k+1,0,[r0,c0],[r1,c1]);
          occ[r0][c0]=i;occ[r1][c1]=i;
          detoured++;
          _detourBudget[i]--;
          did=true;
          break;
        }
        if(did)break;
      }
    }
  }

  const arrows=placed.reverse();
  return {cols, rows, arrows};
}

function scoreLevel(level){
  const arrows=level.arrows;
  const total=arrows.length;
  if(total<3)return 0;
  let totalTurns=0, multiCellCount=0, oneCellCount=0;
  const dirCount=[0,0,0,0];
  let cellsOccupied=0;
  for(const a of arrows){
    cellsOccupied+=a.cells.length;
    dirCount[a.dir]++;
    if(a.cells.length===1){oneCellCount++;continue}
    multiCellCount++;
    let prev=null;
    for(let i=1;i<a.cells.length;i++){
      const dr=a.cells[i][0]-a.cells[i-1][0];
      const dc=a.cells[i][1]-a.cells[i-1][1];
      const dir=(dr===1?0:dr===-1?2:dc===1?3:1);
      if(prev!==null&&dir!==prev)totalTurns++;
      prev=dir;
    }
  }
  const avgTurns=multiCellCount>0?totalTurns/multiCellCount:0;
  const dirVariety=dirCount.filter(x=>x>0).length;
  const fillPct=cellsOccupied/(level.cols*level.rows);
  let s=0;
  s+=total*0.5;
  s+=avgTurns*5;
  s+=dirVariety*3;
  s+=fillPct*40;       // strong bonus for filling the grid
  s-=oneCellCount*1.5; // dock for leftover dots
  return s;
}

function isSolvable(lev){
  const placed=lev.arrows;
  const rows=lev.rows, cols=lev.cols;
  const N=placed.length;
  const alive=new Array(N).fill(true);
  let removed=0;
  while(removed<N){
    let progress=false;
    for(let i=0;i<N;i++){
      if(!alive[i])continue;
      const head=placed[i].cells[placed[i].cells.length-1];
      const dir=placed[i].dir;
      let cr=head[0]+DY[dir], cc=head[1]+DX[dir];
      let clear=true;
      while(cr>=0&&cr<rows&&cc>=0&&cc<cols&&clear){
        for(let j=0;j<N;j++){
          if(j===i||!alive[j])continue;
          for(const[or,oc] of placed[j].cells){
            if(or===cr&&oc===cc){clear=false;break}
          }
          if(!clear)break;
        }
        cr+=DY[dir]; cc+=DX[dir];
      }
      if(clear){alive[i]=false;removed++;progress=true;break}
    }
    if(!progress)return false;
  }
  return true;
}

function dependencyStats(level){
  const rows=level.rows, cols=level.cols, arrows=level.arrows;
  const N=arrows.length;
  const alive=new Array(N).fill(true);
  let removed=0, depth=0, initial=0, edgesStart=0, maxChain=0;
  const indeg=new Array(N).fill(0);
  const out=[];
  for(let i=0;i<N;i++)out[i]=[];

  const blockersFor=(i,aliveMask)=>{
    const a=arrows[i];
    const head=a.cells[a.cells.length-1];
    const blockers=new Set();
    let cr=head[0]+DY[a.dir], cc=head[1]+DX[a.dir];
    while(cr>=0&&cr<rows&&cc>=0&&cc<cols){
      for(let j=0;j<N;j++){
        if(j===i)continue;
        if(aliveMask && !aliveMask[j])continue;
        for(const[or,oc] of arrows[j].cells){
          if(or===cr&&oc===cc){blockers.add(j);break}
        }
      }
      cr+=DY[a.dir]; cc+=DX[a.dir];
    }
    return [...blockers];
  };

  for(let i=0;i<N;i++){
    const b=blockersFor(i,null);
    edgesStart+=b.length;
    for(const j of b){out[j].push(i);indeg[i]++}
  }
  const memo=new Array(N).fill(0);
  const dfs=i=>{
    if(memo[i])return memo[i];
    let best=1;
    for(const j of out[i])best=Math.max(best,1+dfs(j));
    memo[i]=best;
    return best;
  };
  for(let i=0;i<N;i++)maxChain=Math.max(maxChain,dfs(i));

  while(removed<N){
    const wave=[];
    for(let i=0;i<N;i++){
      if(!alive[i])continue;
      if(blockersFor(i,alive).length===0)wave.push(i);
    }
    if(!wave.length)return {dead:true,initial:0,depth,edgesStart,maxChain,avgWave:N};
    if(depth===0)initial=wave.length;
    for(const i of wave){alive[i]=false;removed++}
    depth++;
  }
  return {dead:false,initial,depth,edgesStart,maxChain,avgWave:N/Math.max(1,depth)};
}

function bake(numLevels){
  const out=[];
  for(let lvl=1; lvl<=numLevels; lvl++){
    let best=null, bestScore=-Infinity;
    const seeds=[];
    for(let i=0;i<24;i++){
      seeds.push(lvl*7919+31337+i*104729+(i%7)*4231);
    }
    const lockProfiles=[
      {bonus:34,penalty:16,score:24},
      {bonus:26,penalty:10,score:12},
      {bonus:18,penalty:6,score:0},
      {bonus:10,penalty:3,score:-16}
    ];
    // Difficulty curve that grows INDEFINITELY. User reference: every
    // ~100 levels feels meaningfully harder than the previous block.
    //   • hardCap on initial openness shrinks with level (more locks)
    //   • minDepth on chain depth grows with level (longer solve waves)
    // Both clamp at extreme bounds so absurdly high levels stay solvable.
    let hardCap, minDepth;
    if(lvl<=5){          // tutorial
      hardCap=2; minDepth=1;
    }else if(lvl<=30){   // early
      hardCap=3; minDepth=2;
    }else if(lvl<=100){  // mid
      hardCap=3; minDepth=3;
    }else if(lvl<=500){
      hardCap=2; minDepth=Math.min(6,3+Math.floor((lvl-100)/100));
    }else if(lvl<=2000){
      hardCap=2; minDepth=Math.min(10,6+Math.floor((lvl-500)/300));
    }else{
      hardCap=1; minDepth=Math.min(14,10+Math.floor((lvl-2000)/1500));
    }
    let bestSoftFallback=null,bestSoftScore=-Infinity;
    for(const profile of lockProfiles){
      _lockHeadBonus=profile.bonus;
      _lockHeadPenalty=profile.penalty;
      for(const seed of seeds){
        const lev=generateLevel(lvl, seed);
        if(!isSolvable(lev))continue;
        const dep=dependencyStats(lev);
        if(dep.dead)continue;
        const openness=dep.initial/Math.max(1,lev.arrows.length);
        const targetOpen=lev.arrows.length<12?.18:.07;
        const sc=scoreLevel(lev)
          + dep.edgesStart*2.1
          + dep.depth*14
          + dep.maxChain*20
          + profile.score
          - Math.max(0,openness-targetOpen)*800;
        // Hard-cap pass first; soft fallback if nothing satisfies.
        if(dep.initial<=hardCap && dep.depth>=minDepth){
          if(sc>bestScore){bestScore=sc;best=lev}
        }
        if(sc>bestSoftScore){bestSoftScore=sc;bestSoftFallback=lev}
      }
    }
    if(!best&&bestSoftFallback){
      best=bestSoftFallback;
    }
    // Last-resort progressive seed expansion. Previously this path used to
    // ship the first seed RAW (i.e. unsolvable) with a console warning,
    // which silently produced ~1.6% deadlocked levels in the bake (e.g.
    // levels 18,20-23,298,407,415 in v1.0.15). Now we keep trying random
    // seeds across all lock profiles until we find a solvable+!dead level.
    // Hard-fail (throw) only after exhausting a huge budget — so a CI
    // failure replaces a silent runtime brick.
    if(!best){
      outer:for(let extra=0; extra<20; extra++){
        for(let i=0;i<50;i++){
          const seed=lvl*7919+31337+(24+extra*50+i)*104729+(i%7)*4231;
          for(const profile of lockProfiles){
            _lockHeadBonus=profile.bonus;
            _lockHeadPenalty=profile.penalty;
            const lev=generateLevel(lvl, seed);
            if(!isSolvable(lev))continue;
            const dep=dependencyStats(lev);
            if(dep.dead)continue;
            best=lev;
            process.stderr.write('  lvl '+lvl+' rescued via expansion (extra batch '+extra+')\n');
            break outer;
          }
        }
      }
    }
    if(!best){
      // 24 + 1000 seeds × 4 profiles = 4096 attempts and still nothing.
      // Something is wrong with the level parameters — fail loud rather
      // than ship an unsolvable level to players.
      throw new Error('lvl '+lvl+' could not be generated solvable after 4096 attempts — generator parameters are broken');
    }
    out.push({cols:best.cols, rows:best.rows, arrows:best.arrows.map(a=>({c:a.cells, d:a.dir}))});
    if(lvl%20===0)process.stderr.write('baked '+lvl+'/'+numLevels+' (score '+bestScore.toFixed(1)+')\n');
  }
  return out;
}

const N=parseInt(process.argv[2]||'200',10);
const levels=bake(N);
process.stdout.write('// Auto-generated by /tmp/bake-levels-v2.js — do NOT hand-edit.\n');
process.stdout.write('// Levels 1..'+N+' baked from Codex-improved generator (braid + detours).\n');
process.stdout.write('window.BAKED_LEVELS='+JSON.stringify(levels)+';\n');
