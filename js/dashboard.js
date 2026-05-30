/* =====================================================
   西条市統計ダッシュボード — メインスクリプト
   CSV読み込み・グラフ描画・編集モード・履歴管理
   ===================================================== */

// ===== グローバル変数 =====
let YEARS = [];   // CSVから動的に生成される年度配列
let D = {};       // 全データオブジェクト

const GC = 'rgba(0,0,0,0.07)'; // グリッド線色
const TC = '#778';               // 目盛り文字色
const charts = {};               // Chart.js インスタンスキャッシュ

// 読み込み対象 CSV ファイル一覧
const CSV_FILES = ['population', 'industry', 'agriculture', 'finance', 'education', 'tourism'];

// ===== 編集モード — カテゴリ別キー定義 =====
const EDIT_CATEGORIES = {
  '人口・世帯': ['pop','male','female','hh','birth','death','mvin','mvout','natChg','socChg','young','work','old','old75','youngR','workR','oldR'],
  '産業・製造': ['manufBiz','manufWork','manufShip','manufVA','gdp','income','incomePC'],
  '農林水産':   ['riceArea','riceYield','barleyArea','barleyYield','forestPriv'],
  '財政・税収': ['finIn','finOut','taxTot','taxCiv','taxProp','finMins','finEdu'],
  '教育・福祉': ['elemStu','jrStu','hsStu','careAll','careS1','careS2','careH1','careH2','careH35','hospNum','clinicNum','dentNum','kodomoCnt','hoikuStu','jidoHH'],
  '観光・防災': ['tour_moto','tour_rail','tour_tsub','tour_ishi','libLend','libStock','komMin','fireNum','fireDmg','rescue','accident','accDeath','crime','carAll','carPass']
};

// キー → 日本語ラベル対応表
const KEY_LABELS = {
  pop:'総人口', male:'男性人口', female:'女性人口', hh:'世帯数',
  birth:'出生数', death:'死亡数', mvin:'転入数', mvout:'転出数',
  natChg:'自然増減', socChg:'社会増減', young:'年少人口',
  work:'生産年齢人口', old:'老年人口', old75:'75歳以上人口',
  youngR:'年少人口率(%)', workR:'生産年齢率(%)', oldR:'高齢化率(%)',
  manufBiz:'製造業事業所数', manufWork:'製造業従業者数',
  manufShip:'製造品出荷額(百万円)', manufVA:'付加価値額(百万円)',
  gdp:'市内総生産(百万円)', income:'市民所得(百万円)', incomePC:'一人当たり所得(千円)',
  riceArea:'水稲作付面積(ha)', riceYield:'水稲収穫量(t)',
  barleyArea:'はだか麦作付面積(ha)', barleyYield:'はだか麦収穫量(t)',
  forestPriv:'民有林面積(ha)',
  finIn:'歳入(百万円)', finOut:'歳出(百万円)', taxTot:'市税収入合計(百万円)',
  taxCiv:'市民税(百万円)', taxProp:'固定資産税(百万円)',
  finMins:'民生費(百万円)', finEdu:'教育費(百万円)',
  elemStu:'小学校児童数', jrStu:'中学校生徒数', hsStu:'高校生徒数',
  careAll:'介護認定者数合計', careS1:'要支援1', careS2:'要支援2',
  careH1:'要介護1', careH2:'要介護2', careH35:'要介護3〜5',
  hospNum:'病院数', clinicNum:'診療所数', dentNum:'歯科診療所数',
  kodomoCnt:'こども医療費助成対象者', hoikuStu:'保育所児童数', jidoHH:'児童手当世帯数',
  tour_ishi:'石鎚ふれあいの里', tour_moto:'本谷温泉館',
  tour_rail:'四国鉄道文化館', tour_tsub:'椿交流館',
  libLend:'図書館貸出冊数', libStock:'図書館蔵書数', komMin:'公民館利用者数',
  fireNum:'火災件数', fireDmg:'火災損害額(千円)', rescue:'救急出動件数',
  accident:'交通事故件数', accDeath:'交通事故死者数', crime:'犯罪発生件数',
  carAll:'自動車等保有台数合計', carPass:'乗用車台数'
};

/* =====================================================
   CSV 読み込み・パース・Dオブジェクト構築
   ===================================================== */

// 全CSVを並列フェッチ
async function loadAllCSVs() {
  const texts = await Promise.all(
    CSV_FILES.map(f =>
      fetch('data/' + f + '.csv').then(r => {
        if (!r.ok) throw new Error(f + '.csv の読み込みに失敗しました (HTTP ' + r.status + ')');
        return r.text();
      })
    )
  );
  return texts.map(parseCSV);
}

// CSV テキスト → オブジェクト配列に変換
function parseCSV(text) {
  const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      const v = (vals[i] !== undefined ? vals[i] : '').trim();
      // 空文字は null、数値文字列は Number に変換
      obj[h] = v === '' ? null : isNaN(v) ? v : Number(v);
    });
    return obj;
  });
}

// 全CSVからDオブジェクトとYEARS配列を構築
function buildD(csvArrays) {
  // 全CSVに含まれる年度の和集合を取得してソート
  const yearSet = new Set();
  csvArrays.forEach(rows => rows.forEach(r => {
    if (r['年度'] != null) yearSet.add(r['年度']);
  }));
  YEARS = [...yearSet].sort((a, b) => a - b);

  // 各キーについて年度順の配列を構築
  D = {};
  csvArrays.forEach(rows => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]).filter(k => k !== '年度');
    keys.forEach(key => {
      D[key] = YEARS.map(yr => {
        const row = rows.find(r => r['年度'] === yr);
        return (row && row[key] !== undefined) ? row[key] : null;
      });
    });
  });
}

// localStorage の上書きデータをDに反映
function applyOverrides() {
  const saved = localStorage.getItem('saijo_overrides');
  if (!saved) return;
  let overrides;
  try { overrides = JSON.parse(saved); } catch { return; }
  Object.entries(overrides).forEach(([key, yearMap]) => {
    if (!D[key]) D[key] = YEARS.map(() => null);
    Object.entries(yearMap).forEach(([yr, val]) => {
      const idx = YEARS.indexOf(Number(yr));
      if (idx >= 0) D[key][idx] = (val === null || val === '') ? null : Number(val);
    });
  });
}

/* =====================================================
   グラフ描画ユーティリティ
   ===================================================== */

// Chart インスタンス生成（既存は破棄）
function mk(id, cfg) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), cfg);
}

// 年度からYEARSインデックスを返す
function getIdx(yr) { return YEARS.indexOf(Number(yr)); }

// nullを除外してスパン付きデータ点を生成
function span(data, years) {
  const pts = [];
  years.forEach((y, i) => { if (data[i] != null) pts.push({ x: y, y: data[i] }); });
  return pts;
}

// スパン付きデータセット定義を返す
function spannedDS(data, years, color, label, extra = {}) {
  return {
    label, data: span(data, years),
    borderColor: color, backgroundColor: color + '33',
    tension: 0.3, pointRadius: 3, fill: false,
    parsing: { xAxisKey: 'x', yAxisKey: 'y' },
    ...extra
  };
}

/* =====================================================
   セクション切り替え
   ===================================================== */
function showS(id, btn) {
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.nav button').forEach(b => b.classList.remove('on'));
  document.getElementById('s-' + id).classList.add('on');
  btn.classList.add('on');
  // セクションに対応するグラフ描画関数を呼ぶ
  ({
    pop:  () => { rPop(); rVit(); rCmp(); rNatSoc(); },
    age:  () => { rAge(); rElderly(); rWorkYoung(); },
    ind:  () => { rManuf(); rMBiz(); rMVA(); rGDP(); },
    agr:  () => { rRice(); rBarley(); buildFarmViz(); rForest(); },
    fin:  () => { rFin(); rTax(); rFinItems(); },
    edu:  () => { rSch(); rCare(); rCareStack(); rClinic(); rChild(); },
    obs:  () => { rTour(); rLib(); rKom(); rFire(); rCrime(); rCar(); },
    cor:  () => rScatter(),
    hm:   () => buildHM(),
    anim: () => initAnim()
  }[id] || Function)();
}

/* =====================================================
   人口・世帯セクション
   ===================================================== */
function rPop() {
  const i1 = getIdx(document.getElementById('py1').value);
  const i2 = getIdx(document.getElementById('py2').value) + 1;
  const sl = YEARS.slice(i1, i2);
  mk('cPop', {
    type: 'bar',
    data: { labels: sl, datasets: [
      { label: '総人口', data: D.pop.slice(i1, i2), backgroundColor: '#1d9e7599', yAxisID: 'y', borderRadius: 2 },
      { label: '世帯数', data: D.hh.slice(i1, i2), backgroundColor: '#378add99', yAxisID: 'y2', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('ja-JP') }}
      },
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 11 }}},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => (v / 10000).toFixed(1) + '万' },
             title: { display: true, text: '人口（人）', color: TC, font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false },
              ticks: { color: '#378add', font: { size: 10 }, callback: v => (v / 10000).toFixed(1) + '万' },
              title: { display: true, text: '世帯数', color: '#378add', font: { size: 10 }}}
      }
    }
  });
}

function rVit() {
  mk('cVit', {
    type: 'line',
    data: { datasets: [
      spannedDS(D.birth, YEARS, '#1d9e75', '出生'),
      spannedDS(D.death, YEARS, '#e24b4a', '死亡', { borderDash: [5, 3] }),
      spannedDS(D.mvin,  YEARS, '#378add', '転入'),
      spannedDS(D.mvout, YEARS, '#ef9f27', '転出', { borderDash: [5, 3] })
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: i => i[0].raw.x + '年',
          label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP')
        }}
      },
      scales: {
        x: { type: 'linear', min: 2011, max: 2024, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rCmp() {
  const A = getIdx(document.getElementById('cA').value);
  const B = getIdx(document.getElementById('cB').value);
  mk('cCmp', {
    type: 'bar',
    data: { labels: ['総人口(万)', '世帯数(万)', '男(万)', '女(万)'], datasets: [
      { label: YEARS[A] + '年', data: [+(D.pop[A]/10000).toFixed(2),+(D.hh[A]/10000).toFixed(2),+(D.male[A]/10000).toFixed(2),+(D.female[A]/10000).toFixed(2)], backgroundColor: '#1d9e7599', borderRadius: 2 },
      { label: YEARS[B] + '年', data: [+(D.pop[B]/10000).toFixed(2),+(D.hh[B]/10000).toFixed(2),+(D.male[B]/10000).toFixed(2),+(D.female[B]/10000).toFixed(2)], backgroundColor: '#378add99', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, color: TC }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }}},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }}}
      }
    }
  });
}

function rNatSoc() {
  mk('cNatSoc', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '自然増減', data: D.natChg.slice(0, 14),
        backgroundColor: D.natChg.slice(0, 14).map(v => v >= 0 ? '#1d9e7599' : '#e24b4a99'), borderRadius: 2 },
      { label: '社会増減', data: D.socChg.slice(0, 14),
        backgroundColor: D.socChg.slice(0, 14).map(v => v >= 0 ? '#378add99' : '#ef9f2799'), borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 11 }, color: TC }},
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('ja-JP') + '人' }}
      },
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

/* =====================================================
   年齢構成セクション
   ===================================================== */
function rAge() {
  mk('cAge', {
    type: 'bar',
    data: { labels: YEARS, datasets: [
      { label: '年少(%)', data: D.youngR, backgroundColor: '#378add99' },
      { label: '生産年齢(%)', data: D.workR, backgroundColor: '#1d9e7599' },
      { label: '老年(%)', data: D.oldR, backgroundColor: '#ef9f2799' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ' ' + c.dataset.label.replace('(%)', '') + ': ' + c.parsed.y.toFixed(1) + '%' }}
      },
      scales: {
        x: { stacked: true, grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { stacked: true, max: 100, grid: { color: GC }, ticks: { color: TC, font: { size: 11 }, callback: v => v + '%' }}
      }
    }
  });
}

function rElderly() {
  mk('cElderly', {
    type: 'line',
    data: { datasets: [
      spannedDS(D.old,   YEARS, '#ef9f27', '65歳以上', { fill: false, yAxisID: 'y' }),
      spannedDS(D.old75, YEARS, '#e24b4a', '75歳以上', { borderDash: [5, 3], fill: false, yAxisID: 'y' })
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP') + '人' }}
      },
      scales: {
        x: { type: 'linear', min: 2011, max: 2026, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 2 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rWorkYoung() {
  mk('cWorkYoung', {
    type: 'line',
    data: { datasets: [
      spannedDS(D.young, YEARS, '#378add', '年少（0〜14歳）', { fill: false }),
      spannedDS(D.work,  YEARS, '#1d9e75', '生産年齢（15〜64歳）', { fill: false, yAxisID: 'y2' })
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP') + '人' }}
      },
      scales: {
        x: { type: 'linear', min: 2011, max: 2026, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 2 }},
        y:  { grid: { color: GC }, ticks: { color: '#378add', font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') },
              title: { display: true, text: '年少（人）', color: '#378add', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false },
              ticks: { color: '#1d9e75', font: { size: 10 }, callback: v => (v / 10000).toFixed(1) + '万' },
              title: { display: true, text: '生産年齢（人）', color: '#1d9e75', font: { size: 10 }}}
      }
    }
  });
}

/* =====================================================
   産業・製造セクション
   ===================================================== */
let indType = 'bar';
function setIT(t, btn) {
  indType = t;
  document.querySelectorAll('#indBr button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  rManuf();
}

function rManuf() {
  const pts = span(D.manufShip, YEARS);
  mk('cManuf', {
    type: indType,
    data: { datasets: [{ label: '製造品出荷額等(百万円)', data: pts,
      backgroundColor: '#534ab799', borderColor: '#534ab7',
      borderRadius: indType === 'bar' ? 2 : 0, tension: 0.3, fill: indType === 'line',
      pointRadius: 4, parsing: { xAxisKey: 'x', yAxisKey: 'y' }
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.raw.y.toLocaleString('ja-JP') + '百万円' }}
      },
      scales: {
        x: { type: 'linear', min: 2010, max: 2022, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rMBiz() {
  mk('cMBiz', {
    type: 'line',
    data: { datasets: [
      spannedDS(D.manufBiz,  YEARS, '#534ab7', '事業所数', { fill: false, yAxisID: 'y' }),
      spannedDS(D.manufWork, YEARS, '#1d9e75', '従業者数', { borderDash: [5, 3], fill: false, yAxisID: 'y2' })
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP') }}
      },
      scales: {
        x: { type: 'linear', min: 2010, max: 2022, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y:  { grid: { color: GC }, ticks: { color: '#534ab7', font: { size: 10 }},
              title: { display: true, text: '事業所数', color: '#534ab7', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#1d9e75', font: { size: 10 }},
              title: { display: true, text: '従業者数', color: '#1d9e75', font: { size: 10 }}}
      }
    }
  });
}

function rMVA() {
  const pts = span(D.manufVA, YEARS);
  mk('cMVA', {
    type: 'bar',
    data: { datasets: [{ label: '付加価値額', data: pts, backgroundColor: '#1d9e7599', borderRadius: 2,
      parsing: { xAxisKey: 'x', yAxisKey: 'y' }
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.raw.y.toLocaleString('ja-JP') + '百万円' }}
      },
      scales: {
        x: { type: 'linear', min: 2010, max: 2022, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

let gdpKey = 'gdp';
function setGDP(k, btn) {
  gdpKey = k;
  document.querySelectorAll('#gdpBr button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  rGDP();
}

function rGDP() {
  const kl = { gdp: '市内総生産（百万円）', income: '市民所得（百万円）', incomePC: '一人当たり所得（千円）' };
  const pts = span(D[gdpKey], YEARS);
  mk('cGDP', {
    type: 'line',
    data: { datasets: [{ label: kl[gdpKey], data: pts,
      borderColor: '#534ab7', backgroundColor: '#534ab722',
      tension: 0.3, fill: true, pointRadius: 3,
      parsing: { xAxisKey: 'x', yAxisKey: 'y' }
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.raw.y.toLocaleString('ja-JP') }}
      },
      scales: {
        x: { type: 'linear', min: 2010, max: 2022, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

/* =====================================================
   農林水産セクション
   ===================================================== */
function rRice() {
  mk('cRice', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '作付面積(ha)', data: D.riceArea.slice(0, 14), backgroundColor: '#3b6d1199', yAxisID: 'y', borderRadius: 2 },
      { label: '収穫量(t)',    data: D.riceYield.slice(0, 14), backgroundColor: '#ef9f2799', yAxisID: 'y2', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('ja-JP') }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#3b6d11', font: { size: 10 }, callback: v => v + 'ha' },
              title: { display: true, text: '作付面積', color: '#3b6d11', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#ef9f27', font: { size: 10 }, callback: v => v + 't' },
              title: { display: true, text: '収穫量', color: '#ef9f27', font: { size: 10 }}}
      }
    }
  });
}

function rBarley() {
  mk('cBarley', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '作付面積(ha)', data: D.barleyArea.slice(0, 14), backgroundColor: '#3b6d1199', yAxisID: 'y', borderRadius: 2 },
      { label: '収穫量(t)',    data: D.barleyYield.slice(0, 14), backgroundColor: '#ef9f2799', yAxisID: 'y2', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + c.parsed.y.toLocaleString('ja-JP') }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#3b6d11', font: { size: 10 }, callback: v => v + 'ha' },
              title: { display: true, text: '作付面積', color: '#3b6d11', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#ef9f27', font: { size: 10 }, callback: v => v + 't' },
              title: { display: true, text: '収穫量', color: '#ef9f27', font: { size: 10 }}}
      }
    }
  });
}

// 農林業センサスデータ（2015・2020の2時点のみ）はCSV外で管理
function buildFarmViz() {
  const el = document.getElementById('farmViz');
  if (!el) return;
  const data = [
    { label: '総農家数',         y2015: 3879, y2020: 3172, color: '#3b6d11', unit: '戸' },
    { label: '販売農家数',       y2015: 2616, y2020: 2027, color: '#639922', unit: '戸' },
    { label: '農業従事者数',     y2015: 6261, y2020: 4562, color: '#0a5c4a', unit: '人' },
    { label: '基幹的農業従事者', y2015: 3153, y2020: 2521, color: '#1d9e75', unit: '人' }
  ];
  const maxVal = 6261;
  let html = '<div style="display:grid;gap:14px">';
  data.forEach(d => {
    const pct15 = (d.y2015 / maxVal * 100).toFixed(1);
    const pct20 = (d.y2020 / maxVal * 100).toFixed(1);
    const change = d.y2020 - d.y2015;
    const pct = (change / d.y2015 * 100).toFixed(1);
    const sign = change < 0 ? '' : '+';
    const cColor = change < 0 ? '#c0392b' : '#1d9e75';
    const cBg = change < 0 ? '#fdecea' : '#e8f8f0';
    html += `<div style="background:#f8fdf9;border:1px solid #c8e4da;border-radius:10px;padding:12px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:12px;font-weight:700;color:#1a3a30">${d.label}</span>
        <span style="font-size:11px;font-weight:700;color:${cColor};background:${cBg};padding:2px 8px;border-radius:10px">${sign}${pct}% (${sign}${change.toLocaleString('ja-JP')}${d.unit})</span>
      </div>
      <div style="display:grid;grid-template-columns:70px 1fr 70px;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:11px;color:#556;text-align:right">2015年</span>
        <div style="background:#e0ede7;border-radius:4px;height:18px"><div style="background:${d.color};width:${pct15}%;height:100%;border-radius:4px"></div></div>
        <span style="font-size:12px;font-weight:700;color:${d.color}">${d.y2015.toLocaleString('ja-JP')}<span style="font-size:10px;font-weight:400;margin-left:2px">${d.unit}</span></span>
      </div>
      <div style="display:grid;grid-template-columns:70px 1fr 70px;align-items:center;gap:8px">
        <span style="font-size:11px;color:#556;text-align:right">2020年</span>
        <div style="background:#e0ede7;border-radius:4px;height:18px"><div style="background:${d.color};opacity:0.6;width:${pct20}%;height:100%;border-radius:4px"></div></div>
        <span style="font-size:12px;font-weight:700;color:${d.color};opacity:.75">${d.y2020.toLocaleString('ja-JP')}<span style="font-size:10px;font-weight:400;margin-left:2px">${d.unit}</span></span>
      </div>
    </div>`;
  });
  const summary = [
    { l: '総農家数', v: '−707戸', p: '▼18.2%' }, { l: '販売農家数', v: '−589戸', p: '▼22.5%' },
    { l: '農業従事者数', v: '−1,699人', p: '▼27.1%' }, { l: '基幹的従事者', v: '−632人', p: '▼20.0%' }
  ];
  html += `<div style="background:#0a5c4a;color:#fff;border-radius:10px;padding:14px 18px">
    <div style="font-size:11px;opacity:.75;margin-bottom:8px">5年間の変化サマリー（2015→2020）</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${summary.map(s => `<div style="text-align:center">
        <div style="font-size:10px;opacity:.7;margin-bottom:4px">${s.l}</div>
        <div style="font-size:16px;font-weight:700">${s.v}</div>
        <div style="font-size:10px;opacity:.65">${s.p}</div>
      </div>`).join('')}
    </div>
  </div></div>`;
  el.innerHTML = html;
}

function rForest() {
  const fPts = span(D.forestPriv, YEARS);
  // 漁業経営体数はセンサス年のみ（CSV外固定データ）
  const fishPts = [{ x: 2013, y: 187 }, { x: 2018, y: 113 }, { x: 2023, y: 90 }];
  mk('cForest', {
    type: 'line',
    data: { datasets: [
      { label: '民有林(ha)', data: fPts, borderColor: '#3b6d11', backgroundColor: '#3b6d1122',
        tension: 0.3, fill: true, pointRadius: 3, yAxisID: 'y', parsing: { xAxisKey: 'x', yAxisKey: 'y' }},
      { label: '漁業経営体数', data: fishPts, borderColor: '#378add', tension: 0,
        pointRadius: 8, fill: false, yAxisID: 'y2', parsing: { xAxisKey: 'x', yAxisKey: 'y' }, showLine: true }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP') }}
      },
      scales: {
        x: { type: 'linear', min: 2011, max: 2025, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 2 }},
        y:  { grid: { color: GC }, ticks: { color: '#3b6d11', font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') },
              title: { display: true, text: '民有林(ha)', color: '#3b6d11', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#378add', font: { size: 10 }},
              title: { display: true, text: '漁業経営体数', color: '#378add', font: { size: 10 }}}
      }
    }
  });
}

/* =====================================================
   財政・税収セクション
   ===================================================== */
function rFin() {
  mk('cFin', {
    type: 'line',
    data: { datasets: [
      { label: '歳入', data: span(D.finIn, YEARS), borderColor: '#378add', tension: 0.3, pointRadius: 3, fill: false, parsing: { xAxisKey: 'x', yAxisKey: 'y' }},
      { label: '歳出', data: span(D.finOut, YEARS), borderColor: '#e24b4a', tension: 0.3, pointRadius: 3, fill: false, borderDash: [5, 3], parsing: { xAxisKey: 'x', yAxisKey: 'y' }}
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => i[0].raw.x + '年', label: c => ' ' + c.dataset.label + ': ' + c.raw.y.toLocaleString('ja-JP') + '百万円' }}
      },
      scales: {
        x: { type: 'linear', min: 2011, max: 2024, grid: { color: GC },
             ticks: { color: TC, font: { size: 10 }, callback: v => v, stepSize: 1 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rTax() {
  mk('cTax', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '市民税',    data: D.taxCiv.slice(0, 14), backgroundColor: '#378add99', borderRadius: 2 },
      { label: '固定資産税', data: D.taxProp.slice(0, 14), backgroundColor: '#1d9e7599', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, color: TC }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rFinItems() {
  mk('cFinItems', {
    type: 'line',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '民生費', data: D.finMins.slice(0, 14), borderColor: '#534ab7', tension: 0.3, pointRadius: 3, fill: false },
      { label: '教育費', data: D.finEdu.slice(0, 14),  borderColor: '#ef9f27', tension: 0.3, pointRadius: 3, fill: false, borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, color: TC }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

/* =====================================================
   教育・福祉セクション
   ===================================================== */
function rSch() {
  mk('cSch', {
    type: 'line',
    data: { labels: YEARS.slice(0, 15), datasets: [
      { label: '小学校', data: D.elemStu.slice(0, 15), borderColor: '#378add', tension: 0.3, pointRadius: 2, fill: false },
      { label: '中学校', data: D.jrStu.slice(0, 15),  borderColor: '#1d9e75', tension: 0.3, pointRadius: 2, fill: false, borderDash: [5, 3] },
      { label: '高等学校', data: D.hsStu.slice(0, 15), borderColor: '#534ab7', tension: 0.3, pointRadius: 2, fill: false, borderDash: [3, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, color: TC }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rCare() {
  const careH = D.careH1.slice(0, 14).map((v, i) => v + D.careH2[i] + D.careH35[i]);
  const careS = D.careS1.slice(0, 14).map((v, i) => v + D.careS2[i]);
  mk('cCare', {
    type: 'line',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '要介護（1〜5）', data: careH, borderColor: '#e24b4a', tension: 0.3, pointRadius: 2, fill: false },
      { label: '要支援（1・2）', data: careS, borderColor: '#ef9f27', tension: 0.3, pointRadius: 2, fill: false, borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rCareStack() {
  mk('cCareStack', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '要支援1',   data: D.careS1.slice(0, 14), backgroundColor: '#9fe1cb99' },
      { label: '要支援2',   data: D.careS2.slice(0, 14), backgroundColor: '#1d9e7599' },
      { label: '要介護1',   data: D.careH1.slice(0, 14), backgroundColor: '#fac77599' },
      { label: '要介護2',   data: D.careH2.slice(0, 14), backgroundColor: '#ef9f2799' },
      { label: '要介護3〜5', data: D.careH35.slice(0, 14), backgroundColor: '#e24b4a99' }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 10 }, color: TC, boxWidth: 10 }}},
      scales: {
        x: { stacked: true, grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { stacked: true, grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rClinic() {
  mk('cClinic', {
    type: 'line',
    data: { labels: YEARS.slice(0, 12), datasets: [
      { label: '病院数',     data: D.hospNum.slice(0, 12),  borderColor: '#378add', tension: 0.1, pointRadius: 4, fill: false, yAxisID: 'y' },
      { label: '診療所数',   data: D.clinicNum.slice(0, 12), borderColor: '#1d9e75', tension: 0.3, pointRadius: 3, fill: false, yAxisID: 'y2' },
      { label: '歯科診療所数', data: D.dentNum.slice(0, 12), borderColor: '#ef9f27', tension: 0.3, pointRadius: 3, fill: false, yAxisID: 'y2', borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 10 }, color: TC, boxWidth: 10 }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#378add', font: { size: 10 }},
              title: { display: true, text: '病院数', color: '#378add', font: { size: 9 }}, min: 8, max: 12 },
        y2: { position: 'right', grid: { display: false }, ticks: { color: TC, font: { size: 10 }},
              title: { display: true, text: '診療所・歯科数', color: TC, font: { size: 9 }}}
      }
    }
  });
}

let childKey = 'hoiku';
function setChild(k, btn) {
  childKey = k;
  document.querySelectorAll('#chilBr button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  rChild();
}
function rChild() {
  const CHILD_D = {
    hoiku:  { d: D.hoikuStu,  l: '保育所入所児童数（人）', c: '#378add' },
    kodomo: { d: D.kodomoCnt, l: 'こども医療費助成対象者数（人）', c: '#1d9e75' },
    jido:   { d: D.jidoHH,    l: '児童手当受給者世帯数（世帯）', c: '#534ab7' }
  };
  const w = CHILD_D[childKey];
  mk('cChild', {
    type: 'line',
    data: { labels: YEARS.slice(0, 14), datasets: [{ label: w.l, data: w.d.slice(0, 14),
      borderColor: w.c, backgroundColor: w.c + '22', tension: 0.3, fill: true, pointRadius: 3
    }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

/* =====================================================
   観光・文化・防災セクション
   ===================================================== */
function rTour() {
  mk('cTour', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '本谷温泉館',     data: D.tour_moto.slice(0, 14), backgroundColor: '#0a5c4a99', borderRadius: 2 },
      { label: '四国鉄道文化館', data: D.tour_rail.slice(0, 14), backgroundColor: '#378add99', borderRadius: 2 },
      { label: '椿交流館',       data: D.tour_tsub.slice(0, 14), backgroundColor: '#ef9f2799', borderRadius: 2 },
      { label: '石鎚ふれあいの里', data: D.tour_ishi.slice(0, 14), backgroundColor: '#534ab799', borderRadius: 2 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 10 }, color: TC, boxWidth: 10 }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rLib() {
  mk('cLib', {
    type: 'line',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '貸出冊数（左軸）', data: D.libLend.slice(0, 14), borderColor: '#534ab7', tension: 0.3, pointRadius: 2, fill: false, yAxisID: 'y' },
      { label: '蔵書数（右軸）',   data: D.libStock.slice(0, 14), borderColor: '#1d9e75', tension: 0.3, pointRadius: 2, fill: false, yAxisID: 'y2', borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#534ab7', font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#1d9e75', font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rKom() {
  mk('cKom', {
    type: 'bar',
    data: { labels: YEARS.slice(0, 14), datasets: [{ label: '公民館利用者数（人）', data: D.komMin.slice(0, 14), backgroundColor: '#1d9e7566', borderRadius: 2 }]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.parsed.y.toLocaleString('ja-JP') + '人' }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

function rFire() {
  mk('cFire', {
    type: 'line',
    data: { labels: YEARS.slice(0, 15), datasets: [
      { label: '救急出動件数（左軸）', data: D.rescue.slice(0, 15),  borderColor: '#e24b4a', tension: 0.3, pointRadius: 2, fill: false, yAxisID: 'y' },
      { label: '火災件数（右軸）',     data: D.fireNum.slice(0, 15), borderColor: '#ef9f27', tension: 0.3, pointRadius: 3, fill: false, yAxisID: 'y2', borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#e24b4a', font: { size: 10 }},
              title: { display: true, text: '救急出動（件）', color: '#e24b4a', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#ef9f27', font: { size: 10 }},
              title: { display: true, text: '火災（件）', color: '#ef9f27', font: { size: 10 }}}
      }
    }
  });
}

function rCrime() {
  mk('cCrime', {
    type: 'line',
    data: { labels: YEARS.slice(0, 14), datasets: [
      { label: '交通事故（左軸）', data: D.accident.slice(0, 14), borderColor: '#378add', tension: 0.3, pointRadius: 2, fill: false, yAxisID: 'y' },
      { label: '犯罪発生（右軸）', data: D.crime.slice(0, 14),    borderColor: '#e24b4a', tension: 0.3, pointRadius: 2, fill: false, yAxisID: 'y2', borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y:  { grid: { color: GC }, ticks: { color: '#378add', font: { size: 10 }},
              title: { display: true, text: '交通事故（件）', color: '#378add', font: { size: 10 }}},
        y2: { position: 'right', grid: { display: false }, ticks: { color: '#e24b4a', font: { size: 10 }},
              title: { display: true, text: '犯罪（件）', color: '#e24b4a', font: { size: 10 }}}
      }
    }
  });
}

function rCar() {
  mk('cCar', {
    type: 'line',
    data: { labels: YEARS.slice(0, 15), datasets: [
      { label: '合計',   data: D.carAll.slice(0, 15),  borderColor: '#555',    tension: 0.3, pointRadius: 2, fill: false },
      { label: '乗用車', data: D.carPass.slice(0, 15), borderColor: '#1d9e75', tension: 0.3, pointRadius: 2, fill: false, borderDash: [5, 3] }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 11 }, color: TC }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
}

/* =====================================================
   相関分析（散布図）
   ===================================================== */
// MET は関数でDを参照（CSV読み込み後に正しい値が入る）
const MET = {
  pop:       { d: () => D.pop,       l: '総人口（人）' },
  oldR:      { d: () => D.oldR,      l: '高齢化率（%）' },
  manufShip: { d: () => D.manufShip, l: '製造品出荷額（百万円）' },
  taxTot:    { d: () => D.taxTot,    l: '市税収入合計（百万円）' },
  elemStu:   { d: () => D.elemStu,   l: '小学校児童数（人）' },
  careAll:   { d: () => D.careAll,   l: '介護認定者数（人）' },
  rescue:    { d: () => D.rescue,    l: '救急出動件数（件）' },
  libLend:   { d: () => D.libLend,   l: '図書館貸出冊数（冊）' }
};

function pearson(xa, ya) {
  const n = xa.length;
  const mx = xa.reduce((a, b) => a + b, 0) / n;
  const my = ya.reduce((a, b) => a + b, 0) / n;
  const num = xa.reduce((s, x, i) => s + (x - mx) * (ya[i] - my), 0);
  const dx = Math.sqrt(xa.reduce((s, x) => s + (x - mx) ** 2, 0));
  const dy = Math.sqrt(ya.reduce((s, y) => s + (y - my) ** 2, 0));
  return dx * dy === 0 ? 0 : num / (dx * dy);
}

function rScatter() {
  const kx = document.getElementById('corX').value;
  const ky = document.getElementById('corY').value;
  const mx = MET[kx], my = MET[ky];
  const dx = mx.d(), dy = my.d();
  const pts = [];
  YEARS.forEach((yr, i) => { if (dx[i] != null && dy[i] != null) pts.push({ x: dx[i], y: dy[i], yr }); });
  const r = pearson(pts.map(p => p.x), pts.map(p => p.y));
  const s = Math.abs(r) > 0.8 ? '強い相関' : Math.abs(r) > 0.5 ? '中程度の相関' : '弱い相関';
  document.getElementById('corrInfo').textContent = '相関係数 r = ' + r.toFixed(3) + '　（' + s + '）　n=' + pts.length + '年度';
  mk('cScat', {
    type: 'scatter',
    data: { datasets: [{ label: '年度', data: pts, backgroundColor: '#0a5c4acc', pointRadius: 7, pointHoverRadius: 9 }]},
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: 20 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: i => i[0].raw.yr + '年',
          label: c => [mx.l + ': ' + c.raw.x.toLocaleString('ja-JP'), my.l + ': ' + c.raw.y.toLocaleString('ja-JP')]
        }}
      },
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }}, title: { display: true, text: mx.l, color: TC, font: { size: 11 }}},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }}, title: { display: true, text: my.l, color: TC, font: { size: 11 }}}
      }
    }
  });
}

/* =====================================================
   ヒートマップ
   ===================================================== */
const HM_ROWS = [
  { k: 'pop',       l: '人口(万人)',      f: v => (v / 10000).toFixed(2) },
  { k: 'hh',        l: '世帯数(万)',      f: v => (v / 10000).toFixed(2) },
  { k: 'oldR',      l: '高齢化率(%)',     f: v => v.toFixed(1) },
  { k: 'manufShip', l: '製造出荷(億円)',  f: v => v ? Math.round(v / 100) : '-' },
  { k: 'taxTot',    l: '市税収入(億円)',  f: v => v ? Math.round(v / 100) : '-' },
  { k: 'finIn',     l: '歳入(億円)',      f: v => v ? Math.round(v / 100) : '-' },
  { k: 'elemStu',   l: '小学生数(百人)',  f: v => Math.round(v / 100) },
  { k: 'careAll',   l: '介護認定(百人)',  f: v => v ? Math.round(v / 100) : '-' },
  { k: 'rescue',    l: '救急出動(百件)',  f: v => v ? Math.round(v / 100) : '-' },
  { k: 'libLend',   l: '図書館貸出(万冊)', f: v => v ? Math.round(v / 10000) : '-' },
  { k: 'komMin',    l: '公民館利用(万人)', f: v => v ? Math.round(v / 10000) : '-' },
  { k: 'fireNum',   l: '火災件数',         f: v => v != null ? v : '-' }
];

function buildHM() {
  const wrap = document.getElementById('hmWrap');
  const mm = HM_ROWS.map(r => {
    const vals = D[r.k].filter(v => v != null);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  });
  let h = '<table class="hm"><thead><tr><th class="rh">指標</th>';
  YEARS.forEach(y => { h += '<th>' + y + '</th>'; });
  h += '</tr></thead><tbody>';
  HM_ROWS.forEach((row, ri) => {
    const { min, max } = mm[ri];
    h += '<tr><th class="rh">' + row.l + '</th>';
    D[row.k].forEach((v, yi) => {
      if (v == null) { h += '<td style="background:#eee;color:#bbb">-</td>'; return; }
      const norm = max === min ? 0.5 : (v - min) / (max - min);
      const rr = Math.round(10 + (1 - norm) * 40);
      const g  = Math.round(80 + norm * 120);
      const b  = Math.round(60 + norm * 40);
      h += '<td style="background:rgb(' + rr + ',' + g + ',' + b + ');color:#fff" onclick="hmClick(\'' + row.l + '\',' + YEARS[yi] + ',\'' + row.f(v) + '\')">' + row.f(v) + '</td>';
    });
    h += '</tr>';
  });
  h += '</tbody></table>';
  wrap.innerHTML = h;
}

function hmClick(l, yr, v) {
  document.getElementById('hmDetail').textContent = yr + '年 / ' + l + ' : ' + v;
}

/* =====================================================
   アニメーション
   ===================================================== */
let animTimer = null, animIdx = 0;

function togglePlay() {
  const btn = document.getElementById('playBtn');
  if (animTimer) {
    clearInterval(animTimer); animTimer = null; btn.textContent = '▶';
  } else {
    btn.textContent = '⏸';
    animTimer = setInterval(() => {
      animIdx = (animIdx + 1) % YEARS.length;
      document.getElementById('animSl').value = animIdx;
      document.getElementById('animYr').textContent = YEARS[animIdx];
      rAnim();
      if (animIdx === YEARS.length - 1) { clearInterval(animTimer); animTimer = null; btn.textContent = '▶'; }
    }, 600);
  }
}

function animSlChange() {
  animIdx = +document.getElementById('animSl').value;
  document.getElementById('animYr').textContent = YEARS[animIdx];
  rAnim();
}

function initAnim() {
  const sl = document.getElementById('animSl');
  sl.max = YEARS.length - 1;
  animIdx = 0; sl.value = 0;
  document.getElementById('animYr').textContent = YEARS[0];
  rAnim();
}

function rAnim() {
  const k = document.getElementById('animM').value;
  const data = MET[k].d();
  const colors = data.map((v, i) => v == null ? '#ddd' : i <= animIdx ? '#0a5c4a' : '#cce5dd');
  mk('cAnim', {
    type: 'bar',
    data: { labels: YEARS, datasets: [{ data, backgroundColor: colors, borderRadius: 2 }]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw != null ? ' ' + c.raw.toLocaleString('ja-JP') : ' データなし' }}},
      scales: {
        x: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, autoSkip: false, maxRotation: 45 }},
        y: { grid: { color: GC }, ticks: { color: TC, font: { size: 10 }, callback: v => v.toLocaleString('ja-JP') }}
      }
    }
  });
  const cur = data[animIdx], first = data[0];
  const pct = cur != null && first != null ? ((cur - first) / first * 100).toFixed(1) : '-';
  const valid = data.filter(v => v != null);
  const maxV = Math.max(...valid), minV = Math.min(...valid);
  document.getElementById('animStat').innerHTML =
    '<span>' + YEARS[animIdx] + '年：<strong>' + (cur != null ? cur.toLocaleString('ja-JP') : 'データなし') + '</strong></span>' +
    (cur != null ? '<span>2011年比：<strong>' + (Number(pct) > 0 ? '+' : '') + pct + '%</strong></span>' : '') +
    '<span>最大値：<strong>' + maxV.toLocaleString('ja-JP') + '</strong>（' + YEARS[data.indexOf(maxV)] + '年）</span>' +
    '<span>最小値：<strong>' + minV.toLocaleString('ja-JP') + '</strong>（' + YEARS[data.indexOf(minV)] + '年）</span>';
}

/* =====================================================
   CSV エクスポート
   ===================================================== */
function dlCSV() {
  const rows = [['年度', '総人口', '世帯数', '男', '女', '出生', '死亡', '転入', '転出', '自然増減', '社会増減']];
  YEARS.forEach((y, i) => rows.push([
    y, D.pop[i], D.hh[i], D.male[i], D.female[i],
    D.birth[i] ?? '', D.death[i] ?? '', D.mvin[i] ?? '', D.mvout[i] ?? '',
    D.natChg[i] ?? '', D.socChg[i] ?? ''
  ]));
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = 'saijo_pop_data.csv';
  a.click();
}

/* =====================================================
   グラフ画像ダウンロード
   ===================================================== */
function downloadChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = (filename || canvasId) + '.png';
  link.click();
}

// canvas を持つカードすべてに画像DLボタンを追加
function addDownloadButtons() {
  document.querySelectorAll('.card').forEach(card => {
    const canvas = card.querySelector('canvas');
    if (!canvas) return;
    const btn = document.createElement('button');
    btn.className = 'dl-img-btn';
    btn.textContent = '📷 画像保存';
    btn.onclick = () => downloadChart(canvas.id, 'saijo_' + canvas.id);
    card.appendChild(btn);
  });
}

/* =====================================================
   更新履歴
   ===================================================== */
const HIST_KEY = 'saijo_history';
const MAX_HIST = 100;

function addHistory(key, year, oldVal, newVal) {
  const hist = getHistory();
  hist.unshift({
    ts:   new Date().toLocaleString('ja-JP'),
    key:  KEY_LABELS[key] || key,
    year, old: oldVal, new: newVal
  });
  if (hist.length > MAX_HIST) hist.length = MAX_HIST;
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  updateHistBadge();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}

function updateHistBadge() {
  const badge = document.getElementById('histBadge');
  if (!badge) return;
  const n = getHistory().length;
  badge.textContent = n > 0 ? n : '';
  badge.style.display = n > 0 ? 'inline' : 'none';
}

function openHistModal() {
  const hist = getHistory();
  const list = document.getElementById('histList');
  list.innerHTML = hist.length
    ? hist.map(h => `<div class="hist-item">
        <span class="hist-ts">${h.ts}</span>
        <span class="hist-key">${h.key}</span>
        <span class="hist-val">${h.year}年: ${h.old ?? '-'} → ${h.new ?? '-'}</span>
      </div>`).join('')
    : '<div class="hist-empty">更新履歴はまだありません</div>';
  document.getElementById('histModal').classList.add('open');
}

function closeHistModal() { document.getElementById('histModal').classList.remove('open'); }

function clearHistory() {
  if (!confirm('更新履歴をすべて削除しますか？')) return;
  localStorage.removeItem(HIST_KEY);
  updateHistBadge();
  closeHistModal();
}

/* =====================================================
   編集モード
   ===================================================== */
let currentEditCat = Object.keys(EDIT_CATEGORIES)[0];
let pendingEdits = {};

function openEditModal() {
  pendingEdits = {};
  renderEditTabs();
  renderEditTable();
  document.getElementById('editModal').classList.add('open');
}

function closeEditModal() { document.getElementById('editModal').classList.remove('open'); }

function renderEditTabs() {
  document.getElementById('editCatTabs').innerHTML =
    Object.keys(EDIT_CATEGORIES).map(cat =>
      `<button class="${cat === currentEditCat ? 'on' : ''}" onclick="switchEditCat('${cat}')">${cat}</button>`
    ).join('');
}

function switchEditCat(cat) {
  currentEditCat = cat;
  renderEditTabs();
  renderEditTable();
}

function getSavedOverrides() {
  try { return JSON.parse(localStorage.getItem('saijo_overrides') || '{}'); } catch { return {}; }
}

function renderEditTable() {
  const keys = EDIT_CATEGORIES[currentEditCat];
  const overrides = getSavedOverrides();
  let html = '<table class="edit-tbl"><thead><tr><th class="yr-col">年度</th>';
  keys.forEach(k => { html += `<th title="${k}">${KEY_LABELS[k] || k}</th>`; });
  html += '</tr></thead><tbody>';
  YEARS.forEach(yr => {
    html += `<tr><td style="font-weight:700;color:#0a5c4a;background:#f0faf5;padding:4px 8px">${yr}</td>`;
    keys.forEach(k => {
      const origVal = D[k] ? D[k][YEARS.indexOf(yr)] : null;
      const ovVal   = overrides[k] && overrides[k][yr] !== undefined ? overrides[k][yr] : null;
      const dispVal = ovVal !== null ? ovVal : origVal;
      const isOv    = ovVal !== null;
      html += `<td><input type="number" step="any"
        value="${dispVal ?? ''}"
        data-key="${k}" data-year="${yr}" data-orig="${origVal ?? ''}"
        class="${isOv ? 'changed' : ''}"
        oninput="markEdit(this)"></td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  document.getElementById('editTableWrap').innerHTML = html;
}

function markEdit(input) {
  const key  = input.dataset.key;
  const year = Number(input.dataset.year);
  const orig = input.dataset.orig;
  const val  = input.value.trim();
  // 元の値と異なる場合はハイライト
  input.classList.toggle('changed', val !== orig);
  if (!pendingEdits[key]) pendingEdits[key] = {};
  pendingEdits[key][year] = val === '' ? null : Number(val);
}

function saveEdits() {
  const overrides = getSavedOverrides();
  // pendingEdits を overrides にマージして差分を履歴に記録
  Object.entries(pendingEdits).forEach(([key, yearMap]) => {
    if (!overrides[key]) overrides[key] = {};
    Object.entries(yearMap).forEach(([yr, newVal]) => {
      const idx    = YEARS.indexOf(Number(yr));
      const oldVal = D[key] ? D[key][idx] : null;
      if (String(oldVal) !== String(newVal)) addHistory(key, Number(yr), oldVal, newVal);
      overrides[key][yr] = newVal;
    });
  });
  localStorage.setItem('saijo_overrides', JSON.stringify(overrides));
  // D に上書きを反映してグラフを再描画
  applyOverrides();
  closeEditModal();
  // 現在アクティブなセクションを再描画
  const activeBtn = document.querySelector('.nav button.on');
  if (activeBtn) activeBtn.click();
}

function resetEdits() {
  if (!confirm('ブラウザで保存した編集をすべてリセットし、CSVの元データに戻しますか？')) return;
  localStorage.removeItem('saijo_overrides');
  loadAllCSVs().then(csvArrays => {
    buildD(csvArrays);
    closeEditModal();
    const activeBtn = document.querySelector('.nav button.on');
    if (activeBtn) activeBtn.click();
  });
}

/* =====================================================
   初期化
   ===================================================== */
async function init() {
  try {
    const csvArrays = await loadAllCSVs();
    buildD(csvArrays);
    applyOverrides();    // localStorage 上書きを適用
    updateHistBadge();   // 履歴バッジ更新
    addDownloadButtons(); // 画像DLボタン追加
    // 初期グラフ描画（人口・世帯タブ）
    rPop(); rVit(); rCmp(); rNatSoc();
  } catch (e) {
    console.error(e);
    alert('❌ CSVの読み込みに失敗しました。\n\n' + e.message + '\n\nLive Server（VS Code）またはHTTPサーバーでご確認ください。\nfile:// での直接開きには対応していません。');
  }
}

window.addEventListener('load', init);
