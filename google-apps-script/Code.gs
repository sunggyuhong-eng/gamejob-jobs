var ACTIVE_STAGES = ['온라인 과제','코딩테스트','역량검사','면접','1차 면접','2차 면접','면접합격','처우단계','Offer'];

// GitHub Pages의 '데이터 다시 불러오기' 전용 읽기 API입니다.
// JSONP 콜백만 허용하며 시트에는 어떤 값도 쓰지 않습니다.
function doGet(e) {
  try {
    var callback = clean_(e && e.parameter && e.parameter.callback);
    if (!/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
      return output_({ ok: false, error: '올바르지 않은 콜백입니다.' });
    }
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(dashboard_()) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  } catch (error) {
    var message = String(error && error.message ? error.message : error);
    var safeCallback = clean_(e && e.parameter && e.parameter.callback);
    if (/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(safeCallback)) {
      return ContentService
        .createTextOutput(safeCallback + '(' + JSON.stringify({ ok: false, error: message }) + ');')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return output_({ ok: false, error: message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
    if (!expected || body.token !== expected) return output_({ ok: false, error: '인증 토큰이 올바르지 않습니다.' });
    if (body.action === 'dashboard') return output_(dashboard_());
    return output_({ ok: false, error: '허용되지 않은 요청입니다.' });
  } catch (error) {
    return output_({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function dashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var interview = findSheet_(ss, ['Dashboard_지원자']);
  if (!interview) throw new Error('연동용 사본에서 Dashboard_지원자 시트를 찾지 못했습니다.');
  var openingSheet = findSheet_(ss, ['Dashboard_TO']);
  if (!openingSheet) throw new Error('연동용 사본에서 Dashboard_TO 시트를 찾지 못했습니다.');

  var openingTable = openingTable_(openingSheet);
  var openings = [];
  for (var o = openingTable.headerRow; o < openingTable.values.length; o++) {
    var openingRow = openingTable.values[o];
    var openingProject = clean_(openingRow[openingTable.columns.project]);
    var openingTitle = clean_(openingRow[openingTable.columns.title]);
    if (!openingProject || !openingTitle) continue;
    openings.push({
      row: o + 1,
      project: openingProject,
      title: openingTitle,
      targetTo: number_(openingRow[openingTable.columns.targetTo]),
      reason: clean_(openingRow[openingTable.columns.reason])
    });
  }

  var candidateTable = table_(interview, ['진행단계','이름','직무(공고명)']);
  var col = candidateTable.columns;
  var hireDateColumn = firstColumn_(col, ['입사일', '입사 확정 날짜', '입사확정날짜', '입사 확정일', '입사확정일', '입사예정일']);
  var firstInterviewColumn = firstColumn_(col, ['1차 면접 날짜', '1차면접날짜', '1차 면접일', '1차면접일', '1차 면접']);
  var secondInterviewColumn = firstColumn_(col, ['2차 면접 날짜', '2차면접날짜', '2차 면접일', '2차면접일', '2차 면접']);
  var timezone = ss.getSpreadsheetTimeZone();
  var candidates = [];
  var hiredCounts = {};

  for (var i = candidateTable.headerRow; i < candidateTable.values.length; i++) {
    var row = candidateTable.values[i];
    var rawRow = candidateTable.rawValues[i] || [];
    var stage = clean_(row[col['진행단계']]);
    var name = clean_(row[col['이름']]);
    var title = clean_(row[col['직무(공고명)']]);
    var project = col['PJ'] == null ? '' : clean_(row[col['PJ']]);
    if (!title) continue;
    var openingKey = key_(project, title);
    if (stage === 'Hired') hiredCounts[openingKey] = (hiredCounts[openingKey] || 0) + 1;
    if (name && ACTIVE_STAGES.indexOf(stage) >= 0) {
      candidates.push({
        id: 'row-' + (i + 1),
        row: i + 1,
        name: name,
        stage: stage,
        project: project,
        openingTitle: title,
        hireDate: dateValue_(rawRow, row, hireDateColumn, timezone),
        firstInterviewDate: dateValue_(rawRow, row, firstInterviewColumn, timezone),
        secondInterviewDate: dateValue_(rawRow, row, secondInterviewColumn, timezone)
      });
    }
  }

  return {
    ok: true,
    openings: openings,
    candidates: candidates,
    hiredCounts: hiredCounts,
    syncedAt: new Date().toISOString()
  };
}

function openingTable_(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var aliases = {
    project: ['프로젝트', '프로젝트명', '프로젝트 명', '프로젝트 이름', 'PJ'],
    title: ['공고명', '공고 이름', '직무(공고명)'],
    targetTo: ['채용인원', '채용 인원', 'TO', '목표 TO'],
    reason: ['채용사유', '채용 사유', '채용배경', '채용 배경']
  };
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      var header = clean_(value);
      Object.keys(aliases).forEach(function(key) {
        if (aliases[key].indexOf(header) >= 0) columns[key] = index;
      });
    });
    if (columns.project != null && columns.title != null && columns.targetTo != null && columns.reason != null) {
      return { values: values, headerRow: r + 1, columns: columns };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 프로젝트, 공고명, 채용인원, 채용사유 헤더를 찾지 못했습니다.');
}

function table_(sheet, required) {
  var range = sheet.getDataRange();
  var values = range.getDisplayValues();
  var rawValues = range.getValues();
  for (var r = 0; r < Math.min(values.length, 40); r++) {
    var columns = {};
    values[r].forEach(function(value, index) {
      if (clean_(value)) columns[clean_(value)] = index;
    });
    if (required.every(function(name) { return columns[name] != null; })) {
      return { values: values, rawValues: rawValues, headerRow: r + 1, columns: columns };
    }
  }
  throw new Error(sheet.getName() + ' 시트에서 필수 열(' + required.join(', ') + ')을 찾지 못했습니다.');
}

function findSheet_(ss, names) {
  for (var i = 0; i < names.length; i++) {
    var sheet = ss.getSheetByName(names[i]);
    if (sheet) return sheet;
  }
  return null;
}

function firstColumn_(columns, names) {
  for (var i = 0; i < names.length; i++) {
    if (columns[names[i]] != null) return columns[names[i]];
  }
  return null;
}

function dateValue_(rawRow, displayRow, column, timezone) {
  if (column == null) return '';
  var raw = rawRow[column];
  if (Object.prototype.toString.call(raw) === '[object Date]' && !isNaN(raw.getTime())) {
    return Utilities.formatDate(raw, timezone || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return clean_(displayRow[column]);
}

function clean_(value) {
  return value == null ? '' : String(value).trim();
}

function number_(value) {
  var match = clean_(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Math.max(0, Number(match[0]) || 0) : 0;
}

function key_(project, title) {
  return clean_(project).replace(/\s+/g, ' ').toLowerCase() + '\u001f' + clean_(title).replace(/\s+/g, ' ').toLowerCase();
}

function output_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
