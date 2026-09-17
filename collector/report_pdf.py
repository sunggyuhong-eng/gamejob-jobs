from __future__ import annotations

import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)

from collector.pipeline import ROOT, read_json

BLUE = colors.HexColor("#3182F6")
BLUE_DARK = colors.HexColor("#1B64DA")
BLUE_SOFT = colors.HexColor("#E8F3FF")
INK = colors.HexColor("#191F28")
BODY = colors.HexColor("#4E5968")
MUTED = colors.HexColor("#8B95A1")
LINE = colors.HexColor("#E5E8EB")
SURFACE = colors.HexColor("#F2F4F6")
UP = colors.HexColor("#F04452")
DOWN = colors.HexColor("#3182F6")
GREEN = colors.HexColor("#20A779")

FONT_PATH = ROOT / "assets" / "fonts" / "NanumGothic.ttf"
if not FONT_PATH.exists():
    raise RuntimeError(f"PDF 한글 글꼴이 없습니다: {FONT_PATH}")
pdfmetrics.registerFont(TTFont("NanumGothic", str(FONT_PATH)))
FONT = "NanumGothic"


def clean(value: object, limit: int | None = None) -> str:
    text = re.sub(r"\bnull\b", "비교 데이터 없음", str(value or ""), flags=re.IGNORECASE)
    text = re.sub(r"\[([^]]+)]\([^)]+\)", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    if limit and len(text) > limit:
        return text[: limit - 1].rstrip() + "…"
    return text


def markup(value: object, limit: int | None = None) -> str:
    return escape(clean(value, limit))


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle("cover_kicker", parent=base["Normal"], fontName=FONT, fontSize=8, leading=12, textColor=BLUE, spaceAfter=10),
        "cover_title": ParagraphStyle("cover_title", parent=base["Title"], fontName=FONT, fontSize=28, leading=37, textColor=INK, spaceAfter=13),
        "cover_sub": ParagraphStyle("cover_sub", parent=base["Normal"], fontName=FONT, fontSize=11, leading=18, textColor=BODY),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName=FONT, fontSize=20, leading=27, textColor=INK, spaceBefore=3, spaceAfter=13),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName=FONT, fontSize=12, leading=18, textColor=INK, spaceBefore=12, spaceAfter=7),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontName=FONT, fontSize=8.5, leading=14, textColor=BODY, wordWrap="CJK"),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontName=FONT, fontSize=7, leading=11, textColor=MUTED, wordWrap="CJK"),
        "white": ParagraphStyle("white", parent=base["BodyText"], fontName=FONT, fontSize=9, leading=15, textColor=colors.white, wordWrap="CJK"),
        "callout": ParagraphStyle("callout", parent=base["BodyText"], fontName=FONT, fontSize=11, leading=18, textColor=INK, wordWrap="CJK"),
        "number": ParagraphStyle("number", parent=base["Normal"], fontName=FONT, fontSize=18, leading=22, textColor=INK, alignment=TA_CENTER),
        "label": ParagraphStyle("label", parent=base["Normal"], fontName=FONT, fontSize=7, leading=10, textColor=MUTED, alignment=TA_CENTER),
        "table_head": ParagraphStyle("table_head", parent=base["Normal"], fontName=FONT, fontSize=7, leading=10, textColor=BODY, alignment=TA_CENTER),
        "table": ParagraphStyle("table", parent=base["Normal"], fontName=FONT, fontSize=7.2, leading=11, textColor=INK, wordWrap="CJK"),
    }


def fmt_change(value: object) -> str:
    if value is None:
        return "기준 없음"
    number = int(value)
    return f"{number:+,}건"


def kpi_table(stats: dict, s: dict) -> Table:
    rows = [
        ("전체 공개 공고", f"{int(stats.get('total_open') or 0):,}건", f"전월 대비 {fmt_change(stats.get('change'))}"),
        ("신규 공고", f"{int(stats.get('new_count') or 0):,}건", "이번 기간 신규 확인"),
        ("유지 공고", f"{int(stats.get('maintained_count') or 0):,}건", "두 기간 모두 확인"),
        ("종료 공고", f"{int(stats.get('closed_count') or 0):,}건", "이전 기간 대비 종료"),
    ]
    cells = []
    for label, value, sub in rows:
        cells.append([Paragraph(label, s["label"]), Paragraph(value, s["number"]), Paragraph(sub, s["small"])])
    table = Table(
        [[Table([[item] for item in cell], colWidths=[36*mm], rowHeights=[7*mm, 10*mm, 7*mm]) for cell in cells]],
        colWidths=[40.5*mm]*4,
        hAlign="LEFT",
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), .6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), .6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2*mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2*mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2*mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2*mm),
    ]))
    return table


def delta_chart(rows: list[dict], width: float = 166*mm, height: float = 67*mm) -> Drawing:
    rows = sorted([row for row in rows if row.get("change") is not None], key=lambda row: abs(row.get("change") or 0), reverse=True)[:8]
    drawing = Drawing(width, height)
    if not rows:
        drawing.add(String(4, height/2, "비교 가능한 데이터가 없습니다.", fontName=FONT, fontSize=8, fillColor=MUTED))
        return drawing
    label_width, value_width = 38*mm, 18*mm
    chart_width = width - label_width - value_width - 4*mm
    max_value = max(1, *(abs(int(row.get("change") or 0)) for row in rows))
    row_height = height / len(rows)
    for index, row in enumerate(rows):
        y = height - (index + .72) * row_height
        value = int(row.get("change") or 0)
        drawing.add(String(0, y, clean(row.get("name"), 16), fontName=FONT, fontSize=7.2, fillColor=BODY))
        drawing.add(Rect(label_width, y - 1.2, chart_width, 4.2, fillColor=colors.HexColor("#E9EDF1"), strokeColor=None, rx=2, ry=2))
        bar_width = max(2, abs(value) / max_value * chart_width)
        drawing.add(Rect(label_width, y - 1.2, bar_width, 4.2, fillColor=UP if value >= 0 else DOWN, strokeColor=None, rx=2, ry=2))
        drawing.add(String(width - value_width + 2*mm, y - .5, f"{value:+,}", fontName=FONT, fontSize=7.2, fillColor=UP if value > 0 else DOWN if value < 0 else MUTED))
    return drawing


def trend_chart(months: list[dict], width: float = 166*mm, height: float = 56*mm) -> Drawing:
    drawing = Drawing(width, height)
    if not months:
        return drawing
    values = [int(row.get("total_open") or 0) for row in months]
    low, high = min(values), max(values)
    spread = max(1, high - low)
    left, right, bottom, top = 13*mm, width - 4*mm, 9*mm, height - 6*mm
    for index in range(4):
        y = bottom + (top-bottom) * index / 3
        value = round(low - spread*.15 + spread*1.3*index/3)
        drawing.add(Line(left, y, right, y, strokeColor=LINE, strokeWidth=.5))
        drawing.add(String(0, y-2, f"{value:,}", fontName=FONT, fontSize=6, fillColor=MUTED))
    points = []
    for index, row in enumerate(months):
        x = left + (right-left) * index / max(1, len(months)-1)
        y = bottom + (values[index] - (low-spread*.15)) / (spread*1.3) * (top-bottom)
        points.append((x,y))
        drawing.add(String(x, 1, str(row.get("month") or ""), fontName=FONT, fontSize=6, fillColor=MUTED, textAnchor="middle" if 0 < index < len(months)-1 else "start" if index == 0 else "end"))
    for start, end in zip(points, points[1:]):
        drawing.add(Line(start[0], start[1], end[0], end[1], strokeColor=BLUE, strokeWidth=2))
    for (x,y), value in zip(points, values):
        drawing.add(Rect(x-2, y-2, 4, 4, fillColor=colors.white, strokeColor=BLUE, strokeWidth=1.4, rx=2, ry=2))
        drawing.add(String(x, y+5, f"{value:,}", fontName=FONT, fontSize=6.5, fillColor=INK, textAnchor="middle"))
    return drawing


def stat_table(rows: list[dict], s: dict, limit: int = 8) -> Table:
    data = [[Paragraph("구분", s["table_head"]), Paragraph("이전", s["table_head"]), Paragraph("현재", s["table_head"]), Paragraph("변화", s["table_head"])]]
    for row in rows[:limit]:
        data.append([
            Paragraph(markup(row.get("name"), 22), s["table"]),
            Paragraph("-" if row.get("previous") is None else f"{int(row['previous']):,}", s["table"]),
            Paragraph(f"{int(row.get('current') or 0):,}", s["table"]),
            Paragraph(fmt_change(row.get("change")), s["table"]),
        ])
    table = Table(data, colWidths=[80*mm, 26*mm, 26*mm, 30*mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), SURFACE), ("TEXTCOLOR", (0,0), (-1,0), BODY),
        ("GRID", (0,0), (-1,-1), .45, LINE), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("ALIGN", (1,1), (-1,-1), "RIGHT"), ("TOPPADDING", (0,0), (-1,-1), 2.2*mm),
        ("BOTTOMPADDING", (0,0), (-1,-1), 2.2*mm),
    ]))
    return table


def insight_cards(items: list[dict], s: dict, kind: str, limit: int = 4) -> list:
    result = []
    for item in items[:limit]:
        title = markup(item.get("name") or item.get("company") or "업계")
        signal = markup(item.get("direction") or item.get("evidence_level") or "관찰")
        body = markup(item.get("comment") or item.get("headline"), 230)
        table = Table([[Paragraph(f"<font color='#3182F6'>{title}</font>  {signal}", s["h2"])], [Paragraph(body, s["body"])]], colWidths=[162*mm])
        table.setStyle(TableStyle([("BOX", (0,0), (-1,-1), .6, LINE), ("BACKGROUND", (0,0), (-1,-1), colors.white), ("LEFTPADDING", (0,0), (-1,-1), 4*mm), ("RIGHTPADDING", (0,0), (-1,-1), 4*mm), ("TOPPADDING", (0,0), (-1,-1), 2.5*mm), ("BOTTOMPADDING", (0,0), (-1,-1), 2.5*mm)]))
        result.extend([KeepTogether(table), Spacer(1, 2.5*mm)])
    if not result:
        result.append(Paragraph(f"{kind} 해설이 없습니다.", s["body"]))
    return result


def page_decor(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(INK)
    canvas.rect(0, height-13*mm, width, 13*mm, fill=1, stroke=0)
    canvas.setFont(FONT, 7)
    canvas.setFillColor(colors.white)
    canvas.drawString(18*mm, height-8.2*mm, "GAME INDUSTRY HIRING RESEARCH")
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width-18*mm, 10*mm, f"{doc.page}  |  게임잡 공개 공고 기반")
    canvas.setStrokeColor(LINE)
    canvas.line(18*mm, 14*mm, width-18*mm, 14*mm)
    canvas.restoreState()


def build_report_pdf(report: dict, output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    s = styles()
    stats = report.get("statistics") or {}
    analysis = report.get("analysis") or {}
    history = read_json(ROOT / "data" / "history-summary.json", {}).get("months") or []
    comparison = clean(report.get("comparison_label") or f"{report.get('baseline_period','-')} 대비 {report.get('current_period') or report.get('period','-')}").replace("→", "대비")
    doc = SimpleDocTemplate(str(output_path), pagesize=A4, rightMargin=22*mm, leftMargin=22*mm, topMargin=22*mm, bottomMargin=19*mm, title=f"{report.get('period')} 게임업계 채용 리포트", author="Game Industry Hiring Tracker")
    story = []

    story += [Spacer(1, 17*mm), Paragraph("MONTHLY GAME HIRING RESEARCH", s["cover_kicker"]), Paragraph(f"{str(report.get('period','')).replace('-', '년 ')}월<br/>게임업계 채용 리포트", s["cover_title"]), Paragraph(markup(comparison + " 공개 채용공고 비교"), s["cover_sub"]), Spacer(1, 12*mm)]
    outlook = clean(analysis.get("outlook") or ("게임업계 공개 채용공고는 전월 대비 " + ("증가했습니다." if (stats.get("change") or 0) >= 0 else "감소했습니다.")), 180)
    callout = Table([[Paragraph("이번 달의 결론", s["cover_kicker"]), Paragraph(markup(outlook), s["callout"])]], colWidths=[31*mm, 131*mm])
    callout.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), BLUE_SOFT), ("BOX", (0,0), (-1,-1), .7, colors.HexColor("#CBE2FF")), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 4*mm), ("RIGHTPADDING", (0,0), (-1,-1), 4*mm), ("TOPPADDING", (0,0), (-1,-1), 4*mm), ("BOTTOMPADDING", (0,0), (-1,-1), 4*mm)]))
    story += [callout, Spacer(1, 9*mm), kpi_table(stats, s), Spacer(1, 9*mm), Paragraph("핵심 포인트", s["h2"])]
    highlights = analysis.get("highlights") or [f"전체 공고는 {int(stats.get('previous_total') or 0):,}건에서 {int(stats.get('total_open') or 0):,}건으로 {fmt_change(stats.get('change'))} 변했습니다.", f"신규 {int(stats.get('new_count') or 0):,}건, 유지 {int(stats.get('maintained_count') or 0):,}건, 종료 {int(stats.get('closed_count') or 0):,}건입니다."]
    for item in highlights[:4]:
        story.append(Paragraph("• " + markup(item, 180), s["body"]))
        story.append(Spacer(1, 1.5*mm))
    story += [Spacer(1, 5*mm), Paragraph("본 자료는 게임잡 공개 공고와 수집된 뉴스만을 근거로 하며, 채용 증감과 뉴스의 인과관계를 임의로 단정하지 않습니다.", s["small"]), PageBreak()]

    story += [Paragraph("1. 시장 규모와 직무 모멘텀", s["h1"]), Paragraph(f"{comparison} 기준 공개 공고 흐름과 직무별 변화입니다.", s["body"]), Spacer(1, 3*mm), trend_chart(history, height=46*mm), Spacer(1, 4*mm), Paragraph("직무별 증감", s["h2"]), delta_chart(stats.get("by_category") or [], height=51*mm), Spacer(1, 3*mm), stat_table(sorted(stats.get("by_category") or [], key=lambda row: abs(row.get("change") or 0), reverse=True), s, 4)]
    job_insights = analysis.get("job_insights") or []
    if job_insights:
        story += [Paragraph("직무 해설", s["h2"])]
        for item in job_insights[:2]:
            story.append(Paragraph(f"• {markup(item.get('name'))} · {markup(item.get('direction'))} — {markup(item.get('comment'), 115)}", s["small"]))
            story.append(Spacer(1, 1.2*mm))
    story += [PageBreak()]

    story += [Paragraph("2. 회사별 Hiring Momentum", s["h1"]), Paragraph("회사명은 저장된 법인 표기를 기준으로 하며, 계열사와 스튜디오는 별도 공고 주체로 해석합니다.", s["body"]), Spacer(1, 4*mm), delta_chart(stats.get("by_company") or []), Spacer(1, 5*mm)]
    story += insight_cards(analysis.get("company_insights") or [], s, "회사별", 4)
    story += [PageBreak(), Paragraph("3. 뉴스 시그널과 다음 관찰 포인트", s["h1"])]
    story += insight_cards(analysis.get("news_signals") or [], s, "뉴스", 4)
    story += [Paragraph("다음 기간 Watchlist", s["h2"])]
    for index, item in enumerate((analysis.get("watchlist") or ["신규·유지·종료 공고의 다음 기간 변화를 확인합니다."])[:5], start=1):
        story.append(Paragraph(f"{index}. {markup(item, 190)}", s["body"]))
        story.append(Spacer(1, 2*mm))
    story += [Spacer(1, 5*mm), HRFlowable(width="100%", thickness=.7, color=LINE), Paragraph("분석 기준과 유의사항", s["h2"])]
    limitations = analysis.get("limitations") or ["두 기간 비교이므로 장기 추세로 단정하지 않습니다.", "하나의 공고가 여러 직무 태그에 포함될 수 있습니다.", "뉴스와 채용 변화의 동시 발생만으로 인과관계를 단정하지 않습니다."]
    for item in limitations[:6]:
        story.append(Paragraph("• " + markup(item, 220), s["small"]))
        story.append(Spacer(1, 1.5*mm))
    method = report.get("methodology") or {}
    evidence = method.get("evidence") or {}
    story += [Spacer(1, 5*mm), Table([
        [Paragraph("비교 기간", s["table_head"]), Paragraph(comparison, s["table"])],
        [Paragraph("분석 근거", s["table_head"]), Paragraph(f"공고 {evidence.get('job_examples_sent','-')}건 · 뉴스 {evidence.get('news_sent_to_model','-')}건", s["table"])],
        [Paragraph("생성 시각", s["table_head"]), Paragraph(markup(report.get("generated_at") or "미생성"), s["table"])],
    ], colWidths=[35*mm, 127*mm], style=[("GRID",(0,0),(-1,-1),.5,LINE),("BACKGROUND",(0,0),(0,-1),SURFACE),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),3*mm),("RIGHTPADDING",(0,0),(-1,-1),3*mm),("TOPPADDING",(0,0),(-1,-1),2.5*mm),("BOTTOMPADDING",(0,0),(-1,-1),2.5*mm)])]

    doc.build(story, onFirstPage=page_decor, onLaterPages=page_decor)
    return output_path
