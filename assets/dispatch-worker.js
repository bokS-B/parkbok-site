importScripts('/assets/vendor/exceljs.min.js');
const fields = ['상품주문번호', '배송방법', '택배사', '송장번호'];
const parcel = '택배,등기,소포';
function inspect(workbook) {
  const sheet = workbook.getWorksheet('발송처리');
  if (!sheet) return {message: '발송할 시트의 이름을 ‘발송처리’로 바꿔 주세요.'};
  if (sheet.rowCount > 25000) return {message: '25,000행 이하로 나눠서 검사해 주세요.'};
  const columns = new Map(), structure = [];
  sheet.getRow(1).eachCell((cell, column) => {
    if (!fields.includes(cell.value)) return;
    if (columns.has(cell.value)) structure.push(cell.value + ' 열이 두 개예요. 사용할 열 하나만 남겨 주세요.');
    columns.set(cell.value, column);
  });
  for (const name of fields) if (!columns.has(name)) structure.push('첫 행에 ‘' + name + '’ 열이 필요해요.');
  if (structure.length) return {message: '첫 행의 열 제목을 확인하세요.', issues: structure};
  const groups = new Map(), flagged = new Set(), seenOrders = new Map();
  let total = 0;
  function flag(row, reason) {
    if (!groups.has(reason)) groups.set(reason, new Set());
    groups.get(reason).add(row);
    flagged.add(row);
  }
  function read(cell, name, row) {
    const value = cell.value;
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
      if (value !== value.trim()) flag(row, name + ' 앞뒤 공백을 지워 주세요.');
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (name === '송장번호' || name === '상품주문번호') {
        const fmt = (cell.numFmt || '').split(';')[0].replace(/"[^"]*"|\\./g, '');
        const integerPart = fmt.split('.')[0];
        if (/e[+-]0/i.test(fmt) || (integerPart.match(/0/g) || []).length > String(Math.abs(value)).length) {
          flag(row, name + '의 표시 서식이 지수 또는 앞자리 0을 사용해요. 원본 번호와 대조하세요.');
        }
      }
      if (!Number.isInteger(value) || value < 0 || value >= 1e15) flag(row, name + ' 숫자 셀의 원본을 대조한 뒤 텍스트로 입력하세요.');
      return String(value);
    }
    flag(row, name + '에 수식·날짜 등 일반 값이 아닌 셀이 있어요. 원본 값을 확인하세요.');
    return '';
  }
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    total++;
    const values = fields.map(name => read(row.getCell(columns.get(name)), name, index));
    const [order, method, carrier, tracking] = values;
    if (!order || !/^\d+$/.test(order)) flag(index, '상품주문번호를 원본의 숫자 문자열과 대조하세요.');
    if (order && /^\d+$/.test(order)) {
      if (seenOrders.has(order)) {
        const issue = '같은 상품주문번호가 반복돼요. 해당 행들의 송장과 주문을 대조하세요.';
        flag(seenOrders.get(order), issue);
        flag(index, issue);
      } else seenOrders.set(order, index);
    }
    if (!method) flag(index, '배송방법을 입력하세요.');
    else if (method !== parcel) flag(index, '택배 외 배송방법 또는 표기 차이가 있어요. 판매자센터 양식에서 확인하세요.');
    if (method !== parcel) return;
    if (!carrier || carrier === '롯데') flag(index, '택배사명을 확인하세요. 롯데택배는 전체 이름을 입력해요.');
    if (!tracking) flag(index, '택배 송장번호가 비어 있거나 읽을 수 없어요.');
    else if (/^(?:미발급|미입력|입력예정|입력 예정|발급예정|발급 예정|송장번호|운송장번호|없음|[.\s_–—-]+)$/i.test(tracking)) flag(index, '송장번호 대신 안내 문구나 기호가 있어요. 발급된 번호를 입력하세요.');
    else if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+$/.test(tracking)) flag(index, '송장번호가 지수 표기예요. 택배사 원본을 확인하세요.');
  });
  if (!total) return {message:'발송할 주문 행이 없어요.'};
  const issues = [...groups].map(([message, rows]) => {
    const sample = [...rows].sort((a,b) => a-b).slice(0,20).join(', ');
    return sample + '행' + (rows.size > 20 ? ' 외 ' + (rows.size - 20) + '행' : '') + ' · ' + message;
  });
  return {message: total + '행 검사 · ' + (flagged.size ? '확인할 행 ' + flagged.size + '개' : '검사 항목에서 발견된 문제 없음'), issues};
}
self.onmessage = async ({data:file}) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer(), {ignoreNodes:['drawing','picture','dataValidations','conditionalFormatting','pageSetup','headerFooter','sheetViews']});
    self.postMessage(inspect(workbook));
  } catch {
    self.postMessage({message:'파일을 열 수 없어요. 암호가 없는 .xlsx 사본으로 다시 시도해 주세요.'});
  }
};
