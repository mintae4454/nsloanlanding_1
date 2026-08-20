// ▼▼ 구글 Apps Script 웹앱 배포 후 나온 주소를 여기에 붙여넣으세요 ▼▼
const GAS_URL = "https://script.google.com/macros/s/AKfycbzGJADjQF3KEOunwLvTIk24OU9SwoeKz0JgAJ_OZGP-TI2CUltyUH0o6hLs-fL6a9Et3Q/exec";

// 실시간 신청현황 더미 데이터 (주택담보대출)
const surnames = ["김","이","박","최","정","강","조","윤","장","임","한","오","서","신","권","황","안","송","전","홍"];
const conds = ["아파트 담보","빌라 담보","오피스텔 담보","직장인 신용대출","사업자 담보","후순위 담보","신용대출","대환 상담"];
const amounts = ["5,000만원","8,000만원","1억원","1.5억원","2억원","3억원"];
const states = [["승인완료","badge-ok"],["진행중","badge-go"],["조회완료","badge-ok"]];
function rand(a){return a[Math.floor(Math.random()*a.length)]}

let REAL_ROWS = [];  // 구글시트에서 불러온 실제 신청내역(마스킹된 상태)
function dummyRow(){
  return {
    nm: rand(surnames)+"*"+(Math.random()<.5?"*":rand(surnames)),
    type: rand(conds),
    amount: rand(amounts),
    st: rand(states)
  };
}
function pickRow(){
  if(REAL_ROWS.length && Math.random()<0.6){
    const r=REAL_ROWS[Math.floor(Math.random()*REAL_ROWS.length)];
    return { nm:r.nm, type:r.type||rand(conds), amount:r.amount||rand(amounts), st: rand(states) };
  }
  return dummyRow();
}
function rowHTML(rec,isNew){
  return `<div class="live-row${isNew?' isnew':''}">
    <div class="nm">${rec.nm}</div>
    <div>${rec.type}</div>
    <div>${rec.amount}</div>
    <div><span class="${rec.st[1]}">${rec.st[0]}</span></div>
  </div>`;
}
function buildRows(n){
  const box=document.getElementById("liveList");
  if(!box) return;
  let html="";
  for(let i=0;i<n;i++) html+=rowHTML(pickRow(),false);
  box.insertAdjacentHTML("beforeend",html);
}
// 실시간처럼 새 신청내역이 위에서 내려오며 아래로 슬라이딩
function addLiveRow(){
  const box=document.getElementById("liveList");
  if(!box) return;
  const head=box.querySelector(".live-row.head");
  if(!head) return;
  head.insertAdjacentHTML("afterend", rowHTML(pickRow(),true));
  const rows=box.querySelectorAll(".live-row:not(.head)");
  if(rows.length>8) rows[rows.length-1].remove();
}
function startLiveFeed(){
  const tick=function(){
    addLiveRow();
    setTimeout(tick, 2000+Math.random()*2600);
  };
  setTimeout(tick, 1800);
}
// 구글시트의 실제 신청내역(이름 마스킹)을 JSONP로 불러오기 (CORS 우회)
function loadRealRows(){
  if(!GAS_URL || GAS_URL.indexOf("http")!==0) return;
  const cb="__nsLive_"+Math.floor(Math.random()*1e9);
  window[cb]=function(rows){
    if(Array.isArray(rows) && rows.length) REAL_ROWS=rows;
    try{ delete window[cb]; }catch(e){}
  };
  const s=document.createElement("script");
  s.src=GAS_URL+"?list=1&callback="+cb;
  s.onerror=function(){ try{ delete window[cb]; }catch(e){} };
  document.head.appendChild(s);
}

const PAGE_LOADED_AT = Date.now();
function normPhone(v){ return (v||"").replace(/[^0-9]/g,""); }

async function submitForm(e){
  e.preventDefault();
  const f=e.target;

  // 스팸 방어 1: 허니팟(사람에겐 안 보이는 칸)이 채워졌으면 봇 → 조용히 성공처럼 종료
  if((f.website && f.website.value) || (f.homepage && f.homepage.value)){
    alert("한도조회 신청이 접수되었습니다.\n전문 상담원이 곧 연락드리겠습니다. 감사합니다!");
    f.reset(); return false;
  }
  // 스팸 방어 2: 페이지 로드 후 3초 이내 제출은 봇으로 간주
  if(Date.now() - PAGE_LOADED_AT < 3000){
    alert("입력을 조금만 더 확인한 뒤 다시 시도해주세요.");
    return false;
  }
  if(!f.agree.checked){alert("개인정보 수집·이용에 동의해주세요.");return false;}

  // 스팸 방어 3: 휴대폰 번호 형식 검증 (010/011… 10~11자리)
  const phone = normPhone(f.phone.value);
  if(!/^01[0-9]{8,9}$/.test(phone)){
    alert("휴대폰 번호를 정확히 입력해주세요. (예: 01012345678)");
    return false;
  }

  const btn=f.querySelector("button[type=submit]");
  const orig=btn.textContent;
  btn.disabled=true; btn.textContent="접수 중...";

  const data={
    name:f.name.value.trim(),
    phone:phone,
    property:(f.property && f.property.value)||"",
    amount:(f.amount && f.amount.value)||"",
    website:(f.website && f.website.value)||"",
    elapsed:Date.now()-PAGE_LOADED_AT,
    page:location.href,
    ua:navigator.userAgent
  };

  try{
    if(GAS_URL.startsWith("http")){
      await fetch(GAS_URL,{
        method:"POST",
        mode:"no-cors",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(data)
      });
    }
    alert("한도조회 신청이 접수되었습니다.\n전문 상담원이 곧 연락드리겠습니다. 감사합니다!");
    f.reset();
  }catch(err){
    alert("일시적인 오류가 발생했습니다. 전화(0000-0000)로 문의해주세요.");
  }finally{
    btn.disabled=false; btn.textContent=orig;
  }
  return false;
}

loadRealRows();
buildRows(8);
startLiveFeed();

// 수치 카운트업: .countup 요소가 화면에 들어오면 0 -> 목표값으로 상승
function animateCount(el){
  var raw = el.getAttribute("data-cv") || el.textContent;
  el.setAttribute("data-cv", raw);
  var m = raw.match(/[\d,]+(\.\d+)?/);
  if(!m) return;
  var numStr = m[0];
  var target = parseFloat(numStr.replace(/,/g,""));
  if(isNaN(target)) return;
  var decimals = numStr.indexOf(".")>=0 ? numStr.split(".")[1].length : 0;
  var hasComma = numStr.indexOf(",")>=0;
  var prefix = raw.slice(0, m.index);
  var suffix = raw.slice(m.index + numStr.length);
  function fmt(v){
    var s = v.toFixed(decimals);
    if(hasComma){ var p=s.split("."); p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,","); s=p.join("."); }
    return prefix + s + suffix;
  }
  var dur=1300, startT=null;
  function step(ts){
    if(startT===null) startT=ts;
    var pr=Math.min((ts-startT)/dur,1);
    var e=1-Math.pow(1-pr,3);
    el.textContent=fmt(target*e);
    if(pr<1) requestAnimationFrame(step); else el.textContent=fmt(target);
  }
  el.textContent=fmt(0);
  requestAnimationFrame(step);
}
function initCountup(){
  var els=document.querySelectorAll(".countup");
  if(!els.length) return;
  if(!("IntersectionObserver" in window)){ for(var i=0;i<els.length;i++) animateCount(els[i]); return; }
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){ if(en.isIntersecting){ animateCount(en.target); io.unobserve(en.target); } });
  },{threshold:.4});
  els.forEach(function(el){ io.observe(el); });
}
initCountup();
