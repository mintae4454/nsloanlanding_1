/**********************************************************************
 * NS대부중개 한도조회 신청 접수 — Google Sheets 저장 + 텔레그램 알림
 *
 * ── 설치 방법 ──────────────────────────────────────────────
 * 1) 구글 시트 새로 만들기 (예: "NS대출신청")
 * 2) 상단 메뉴 [확장 프로그램] → [Apps Script] 클릭
 * 3) 기본 코드 지우고 이 파일 내용 전체 붙여넣기
 * 4) 아래 CONFIG 3개 값 채우기 (텔레그램 봇 토큰 / 챗ID / 시트ID)
 * 5) 상단 [배포] → [새 배포] → 유형 "웹 앱"
 *      - 실행 계정: 나
 *      - 액세스 권한: "모든 사용자"
 *    → 배포 후 나오는 "웹 앱 URL" 복사
 * 6) parts/app.js 의 GAS_URL 값에 그 URL 붙여넣고  ./build.ps1 재실행
 *
 * ── 텔레그램 봇 만들기 ────────────────────────────────────
 *  · 텔레그램에서 @BotFather 검색 → /newbot → 봇 이름 정하면 토큰 발급
 *  · 발급된 토큰을 TELEGRAM_TOKEN 에 입력
 *  · 알림 받을 본인 계정에서 그 봇에게 아무 메시지나 1번 보낸 뒤,
 *    브라우저에서 아래 주소 열어 "chat":{"id": 숫자} 확인 → CHAT_ID 에 입력
 *    https://api.telegram.org/bot<토큰>/getUpdates
 *  · 여러 명이 받으려면 그룹을 만들어 봇을 초대하고 그 그룹의 chat id 사용
 **********************************************************************/

// ===================== CONFIG (여기만 채우면 됩니다) =====================
const TELEGRAM_TOKEN = "8820502862:AAGCf1oU03lGdWaDLmVeERxiMDwzWRSLVDQ";      // 예: 1234567890:AAH...
const CHAT_ID        = "-5514054034";        // 예: 8123456789  (그룹이면 -100... 형태)
const SHEET_ID       = "";                   // 비워두면 이 스크립트가 속한 시트에 저장
// =======================================================================

function doPost(e) {
  const out = { ok: true, sheet: null, telegram: null };
  let data = {};
  try { data = JSON.parse(e.postData.contents); } catch (err) { data = (e && e.parameter) || {}; }
  const ts = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

  // 0) 중복 실행 차단: 같은 연락처+이름이 20초 내 재요청이면 1번만 처리
  const cache = CacheService.getScriptCache();
  const dedupKey = "dedup_" + (data.phone || "") + "_" + (data.name || "");
  if (cache.get(dedupKey)) { out.dedup = true; return json(out); }
  cache.put(dedupKey, "1", 20);

  // 0-1) 스팸 차단: 허니팟이 채워졌거나 비정상적으로 빠른 제출이면 무시
  if (data.website) { out.spam = "honeypot"; return json(out); }
  if (data.elapsed !== undefined && data.elapsed !== "" && Number(data.elapsed) < 2000) {
    out.spam = "tooFast"; return json(out);
  }
  // 0-2) 전체 폭주 방지: 최근 60초에 30건 초과면 무시
  const rlCount = Number(cache.get("rl_count") || 0) + 1;
  cache.put("rl_count", String(rlCount), 60);
  if (rlCount > 30) { out.spam = "rateLimited"; return json(out); }

  // 1) 시트 기록 (실패해도 텔레그램은 계속 진행)
  try { saveToSheet(data, ts); out.sheet = "ok"; }
  catch (err) { out.sheet = "ERR: " + err; }

  // 2) 텔레그램 알림
  try {
    sendTelegram(
      "🏠 새 한도조회 신청\n" +
      "─────────────\n" +
      "👤 이름 : " + (data.name || "") + "\n" +
      "📱 연락처 : " + (data.phone || "") + "\n" +
      "🏢 담보 : " + (data.property || "") + "\n" +
      "💰 희망금액 : " + (data.amount || "") + "\n" +
      "🕒 " + ts
    );
    out.telegram = "ok";
  } catch (err) { out.telegram = "ERR: " + err; }

  return json(out);
}

/**
 * 브라우저에서 웹앱 URL을 직접 열면 실행됩니다(배포/권한 점검용).
 *  · 그냥 열기        → "정상 작동 중" 문구
 *  · URL 뒤 ?test=1  → 시트 기록 + 텔레그램 알림 실제 테스트 (결과 JSON 표시)
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.list) {
    return listRecent(e);   // 실시간 신청현황용: 시트 최근 내역(이름 마스킹) JSONP 반환
  }
  if (e && e.parameter && e.parameter.test) {
    const fake = { name: "테스트", phone: "010-0000-0000", property: "주택담보대출", amount: "1억원 ~ 3억원", page: "doGet 테스트" };
    return doPost({ postData: { contents: JSON.stringify(fake) } });
  }
  return ContentService.createTextOutput(
    "NS 신청 접수 서버 정상 작동 중입니다.\n테스트하려면 이 주소 끝에 ?test=1 을 붙여 다시 열어보세요."
  );
}

// 최근 신청내역을 이름 마스킹하여 반환 (전화번호는 절대 노출하지 않음)
function listRecent(e) {
  const cb = (e.parameter.callback || "callback").replace(/[^a-zA-Z0-9_]/g, "");
  let rows = [];
  try {
    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheets()[0];
    const last = sheet.getLastRow();
    if (last > 1) {
      const n = Math.min(20, last - 1);
      // 열: 1=접수시각, 2=이름, 3=휴대폰, 4=구분, 5=희망금액
      const vals = sheet.getRange(last - n + 1, 1, n, 5).getValues();
      rows = vals.map(function (r) {
        return { nm: maskName(r[1]), type: String(r[3] || "대출상담"), amount: String(r[4] || "") };
      }).reverse(); // 최신순
    }
  } catch (err) { rows = []; }
  const body = cb + "(" + JSON.stringify(rows) + ");";
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function maskName(name) {
  name = String(name || "").trim();
  if (!name) return "고객";
  if (name.length <= 1) return name + "**";
  return name.charAt(0) + "**";
}

function saveToSheet(data, ts) {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw "시트를 찾을 수 없음: 스크립트가 시트에 연결(bound)되어 있지 않으면 상단 SHEET_ID 값을 채우세요.";
  const sheet = ss.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["접수시각", "이름", "휴대폰", "담보부동산", "희망금액", "유입경로"]);
  }
  sheet.appendRow([ts, data.name, data.phone, data.property, data.amount, data.page || ""]);
}

function sendTelegram(text) {
  const url = "https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage";
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    payload: { chat_id: CHAT_ID, text: text },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) throw "Telegram " + code + ": " + res.getContentText();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// (선택) 배포 전 텔레그램 연결 테스트용: 에디터에서 이 함수 실행
function testTelegram() {
  sendTelegram("✅ NS대부중개 알림 연결 테스트 성공!");
}
