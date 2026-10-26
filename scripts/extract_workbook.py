#!/usr/bin/env python3
"""Extract every sheet of the WSLSA 2027 Degree Guides workbook into one JSON data store.

Usage:
    python3 scripts/extract_workbook.py ["data/source/WSLSA Degree Guides 2027.xlsx"] [data/wslsa-2027.json]

Requires openpyxl. segno is optional and only used to pre-render the handbook QR codes as SVG.

Nothing is truncated: all Overview rows, all Lists rows (including Note 1-4), all 1,915 Pathway Data
rows and every degree sheet (key facts, program structure, recommended pathways, major/minor
schedules, the full subject catalogue and advisor notes) are written to the output. On top of the raw
data the extractor adds a small amount of derived metadata that the explorer needs (resolved choice
pools, parsed campus codes, parsed advisor notes), and it fails loudly if anything cannot be resolved.
"""
import io
import json
import re
import sys
import warnings
from collections import OrderedDict
from datetime import date
from pathlib import Path

import openpyxl

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / "data" / "source" / "WSLSA Degree Guides 2027.xlsx"
DEFAULT_OUT = ROOT / "data" / "wslsa-2027.json"

CODE_RE = re.compile(r"[A-Z]{4} \d{4}")
SESSIONS = ("Autumn", "Spring")


def clean(v):
    if isinstance(v, str):
        v = v.strip()
        return v or None
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def rows_of(ws):
    return [[clean(v) for v in row] for row in ws.iter_rows(values_only=True)]


def split_list(s, sep=";"):
    return [p.strip() for p in (s or "").split(sep) if p.strip()]


# --------------------------------------------------------------------------- campus helpers

def parse_campus_legend(text):
    """'PS Parramatta South · CA Campbelltown · ...' -> OrderedDict(code -> name)."""
    m = re.search(r"Campus codes:\s*(.+?)\.\s*TBC", text)
    if not m:
        raise SystemExit("Could not find the campus legend in the Pathway Explorer sheet")
    out = OrderedDict()
    for part in m.group(1).split("·"):
        part = part.strip()
        code, name = part.split(" ", 1)
        out[code] = name.strip()
    return out


def parse_offered(value):
    """'PS CA PE (2026)' -> {'codes': [...], 'tbc': bool, 'y2026': bool, 'none': bool}."""
    v = (value or "").strip()
    info = {"codes": [], "tbc": False, "y2026": False, "none": False}
    if not v or v in ("—", "-"):
        info["none"] = True
        return info
    if "(2026)" in v:
        info["y2026"] = True
        v = v.replace("(2026)", "").strip()
    if v == "TBC":
        info["tbc"] = True
        return info
    info["codes"] = v.split()
    return info


# --------------------------------------------------------------------------- Overview

OVERVIEW_KEYS = {
    "Code": "code",
    "Degree": "title",
    "Credit points": "cp",
    "Full-time (years)": "ftYears",
    "Part-time (years)": "ptYears",
    "Intake": "intake",
    "Campuses": "campuses",
    "Students": "students",
    "Major / minor choices": "majorChoices",
    "Pathway groups": "pathwayGroups",
    "Assumed knowledge / admission": "assumedKnowledge",
    "External accreditation": "accreditationRaw",
    "Exit awards": "exitAwardsRaw",
    "Pathway subjects with session TBC": "tbcSubjectsRaw",
    "CRICOS": "cricos",
    "Handbook": "handbook",
}


def parse_accreditation(raw):
    """Split the accreditation list into body + status. The workbook text contains an unbalanced
    '(formerly Institute of Chartered Accountants' fragment, so the status is taken as the final
    parenthesised group rather than by balancing brackets."""
    out = []
    for item in split_list(raw):
        m = re.match(r"^(.*)\(([^()]*)\)\s*$", item)
        if m:
            body, status = m.group(1).strip(), m.group(2).strip()
        else:
            body, status = item, None
        abbr = re.search(r"\(([A-Z][A-Za-z]{1,9})\)", body)
        out.append({
            "name": body,
            "abbr": abbr.group(1) if abbr else None,
            "status": status,
            "raw": item,
        })
    return out


def parse_exit_awards(raw):
    out = []
    for item in split_list(raw):
        m = re.match(r"^(\d{4})\s+(.*)$", item)
        code, name = (m.group(1), m.group(2)) if m else (None, item)
        exit_only = "(exit only)" in name
        out.append({"code": code, "name": name.replace("(exit only)", "").strip(), "exitOnly": exit_only, "raw": item})
    return out


def extract_overview(ws):
    rows = rows_of(ws)
    header = rows[0]
    degrees, footnote = [], None
    for r in rows[1:]:
        if not any(r):
            continue
        if r[0] and not r[1]:
            footnote = r[0]
            continue
        d = {}
        for i, h in enumerate(header):
            if h in OVERVIEW_KEYS:
                d[OVERVIEW_KEYS[h]] = r[i]
        d["code"] = str(d["code"])
        d["accreditation"] = parse_accreditation(d["accreditationRaw"])
        d["exitAwards"] = parse_exit_awards(d["exitAwardsRaw"])
        d["tbcSubjects"] = split_list(d["tbcSubjectsRaw"], ",")
        d["campusList"] = split_list(d["campuses"], ",")
        d["intakeList"] = split_list(d["intake"], ",")
        d["fixedStructure"] = (d["majorChoices"] or "").lower().startswith("none")
        degrees.append(d)
    return degrees, footnote


# --------------------------------------------------------------------------- Lists

NOTE_RE = re.compile(
    r"^(?:In the (?P<major>.+?), (?P<kind>Testamur Major(?: \(UG\))?|Major|Minor), )?"
    r"(?P<subject>[A-Z]{4} \d{4}) (?P<subjectTitle>.+?) lists (?P<prereq>[A-Z]{4} \d{4})"
    r"(?: (?P<prereqTitle>.+?))? as a prerequisite"
)


def parse_note(text):
    m = NOTE_RE.match(text)
    if not m:
        raise SystemExit(f"Advisor note did not match the expected pattern: {text!r}")
    g = m.groupdict()
    return {
        "text": text,
        "major": g["major"],
        "majorKind": g["kind"],
        "subject": g["subject"],
        "subjectTitle": g["subjectTitle"],
        "prereq": g["prereq"],
        "prereqTitle": g["prereqTitle"],
    }


def parse_option_label(label):
    """'T046 – Accounting, Testamur Major' -> code, name, kind. 'Not applicable ...' -> BASE."""
    if label.startswith("Not applicable"):
        return {"code": "BASE", "name": None, "kind": None}
    code, rest = label.split(" – ", 1)
    name, kind = rest.rsplit(", ", 1)
    return {"code": code, "name": name, "kind": kind}


def parse_group(text):
    if text.startswith("Single"):
        return {"letter": None, "usedFor": [], "label": text}
    m = re.match(r"^Pathway (\w) \(used for: (.+)\)$", text)
    if not m:
        raise SystemExit(f"Unrecognised pathway group: {text!r}")
    return {"letter": m.group(1), "usedFor": [s.strip() for s in m.group(2).split(", ")], "label": text}


def extract_lists(ws):
    rows = rows_of(ws)
    header = rows[0]
    assert header[:5] == ["Degree", "Major / minor", "Lookup key", "Pathway key", "Pathway group"], header
    assert header[8:13] == ["Code", "Note 1", "Note 2", "Note 3", "Note 4"], header
    options, dropdown, notes = [], [], OrderedDict()
    for r in rows[1:]:
        if r[0]:
            label = parse_option_label(r[1])
            group = parse_group(r[4])
            options.append({
                "degreeLabel": r[0],
                "degree": r[0].split(" – ")[0],
                "majorLabel": r[1],
                "majorCode": label["code"],
                "majorName": label["name"],
                "majorKind": label["kind"],
                "lookupKey": r[2],
                "pathwayKey": r[3],
                "pathwayGroup": r[4],
                "groupLetter": group["letter"],
                "groupUsedFor": group["usedFor"],
            })
        if r[6]:
            dropdown.append(r[6])
        if r[8]:
            code = str(r[8])
            notes[code] = {
                "raw": [n for n in r[9:13] if n],
                "parsed": [parse_note(n) for n in r[9:13] if n],
            }
    return options, dropdown, notes


# --------------------------------------------------------------------------- Pathway Data

PD_HEADER = ["Row key", "Pathway key", "Degree code", "Major code", "Year", "Session", "Slot",
             "Code", "Title", "Type", "Offered at", "CP", "Notes"]


def extract_pathway_data(ws):
    rows = rows_of(ws)
    assert rows[0] == PD_HEADER, rows[0]
    pathways = OrderedDict()
    count = 0
    for r in rows[1:]:
        if not r[0]:
            continue
        count += 1
        key = r[1]
        slot = {
            "rowKey": r[0],
            "degree": str(r[2]),
            "major": str(r[3]),
            "year": int(r[4]),
            "session": r[5],
            "slot": int(r[6]),
            "code": r[7],
            "title": r[8],
            "type": r[9],
            "offered": r[10],
            "cp": r[11],
            "notes": r[12],
        }
        assert slot["session"] in SESSIONS, slot
        assert slot["rowKey"] == f"{key}|{slot['year']}|{slot['session']}|{slot['slot']}", slot
        pathways.setdefault(key, []).append(slot)
    return pathways, count


# --------------------------------------------------------------------------- degree sheets

def is_section(r):
    return r[1] is not None and all(v is None for v in r[2:])


def extract_degree_sheet(ws):
    rows = rows_of(ws)
    out = {
        "sheet": ws.title,
        "heading": rows[0][1],
        "intro": rows[1][1],
        "keyFacts": OrderedDict(),
        "structure": [],
        "structureTotal": None,
        "pathways": [],
        "majorSchedule": [],
        "catalogue": [],
        "advisorNotes": [],
    }
    mode = None
    section = None
    pending_label = None
    current_pathway = None
    schedule_label = None
    for i, r in enumerate(rows):
        b = r[1]
        if i < 2:
            continue
        if all(v is None for v in r):
            if mode in ("pathway", "schedule", "catalogue", "structure"):
                mode = None
            continue
        if mode == "keyfacts" and b != "Program structure":
            out["keyFacts"][b] = r[2]  # some facts (e.g. 2848 CRICOS) are blank
            continue
        if is_section(r):
            text = b
            if text == "Key facts":
                mode = "keyfacts"
            elif text == "Program structure":
                mode = "structure-head"
            elif text.startswith("Recommended pathway"):
                pending_label = text
                mode = "pathway-head"
            elif mode == "pathway-head":
                # the descriptive line below "Recommended pathway"
                desc = text.split(" Campus codes:")[0].rstrip(".")
                current_pathway = {"label": pending_label, "description": desc, "slots": [], "total": None}
                out["pathways"].append(current_pathway)
            elif text.startswith("Your major") or text.startswith("Your minor"):
                schedule_label = text
                mode = "schedule-head"
            elif text.startswith("Every subject in the structure"):
                mode = "catalogue-head"
                section = text
            elif text.startswith("Autumn / Spring show"):
                out["catalogueNote"] = text.split(" Campus codes:")[0]
            elif text == "Check with your advisor":
                mode = "advisor"
            elif mode == "advisor":
                out["advisorNotes"].append(text)
            else:
                raise SystemExit(f"{ws.title}: unexpected section row {i + 1}: {text[:80]!r}")
            continue
        if mode == "structure-head" and b == "Component":
            mode = "structure"
            continue
        if mode == "structure":
            if b == "Total credit points":
                out["structureTotal"] = r[5]
                mode = None
            else:
                out["structure"].append({"component": b, "cp": r[5]})
            continue
        if b == "Year" and r[2] == "Session":
            mode = "pathway"
            continue
        if mode == "pathway":
            if b is None and r[6] == "Total":
                current_pathway["total"] = r[7]
                mode = None
                continue
            current_pathway["slots"].append({
                "year": int(str(b).replace("Year ", "")),
                "session": r[2], "code": r[3], "title": r[4], "type": r[5],
                "offered": r[6], "cp": r[7], "notes": r[8],
            })
            continue
        if b in ("Major", "Minor") and r[2] == "When":
            mode = "schedule"
            continue
        if mode == "schedule":
            m = re.match(r"^Y(\d) (Autumn|Spring)$", r[2])
            out["majorSchedule"].append({
                "group": schedule_label,
                "major": b, "majorCode": b.split(" ", 1)[0],
                "year": int(m.group(1)), "session": m.group(2),
                "code": r[3], "title": r[4], "type": r[5], "offered": r[6], "cp": r[7], "notes": r[8],
            })
            continue
        if b == "Component" and r[2] == "Level":
            mode = "catalogue"
            continue
        if mode == "catalogue":
            out["catalogue"].append({
                "component": b, "level": r[2], "code": r[3], "title": r[4],
                "autumn": r[5], "spring": r[6], "cp": r[7], "source": r[8],
            })
            continue
        raise SystemExit(f"{ws.title}: could not classify row {i + 1}: {r}")
    return out


# --------------------------------------------------------------------------- choice resolution

def split_inline_choice(text):
    parts = re.split(r"\s+or\s+(?=[A-Z]{4} \d{4}\b)", text)
    opts = []
    for p in parts:
        m = re.match(r"^([A-Z]{4} \d{4})\s+(.*)$", p.strip())
        if not m:
            return None
        title = m.group(2).strip()
        tbc = title.endswith("(TBC)")
        if tbc:
            title = title[: -len("(TBC)")].strip()
        opts.append({"code": m.group(1), "title": title, "tbcFlag": tbc})
    return opts


def resolve_pool(title, components):
    """Map a '(see list)' slot title to the catalogue component(s) it draws from."""
    name = title.replace("(see list)", "").strip()
    group = re.search(r"\((Group \d+)\)", name)
    base = re.sub(r"\(Group \d+\)", "", name)
    base = re.sub(r"\b(option|subject)\b", "", base).strip()
    hits = []
    for comp in components:
        if "Alternate" not in comp or "LLB" in comp:
            continue
        if base.lower() not in comp.lower():
            continue
        if group and not re.search(re.escape(group.group(1)) + r"\b", comp):
            continue
        hits.append(comp)
    return hits


def enrich_pathway(slots, degree_sheet, option):
    components = list(OrderedDict.fromkeys(c["component"] for c in degree_sheet["catalogue"]))
    llb = [c for c in components if c.startswith("LLB Alternate")]
    assert len(llb) == 1, (degree_sheet["sheet"], llb)
    for s in slots:
        s["offeredInfo"] = parse_offered(s["offered"])
        t = s["type"]
        if t == "LLB alternate":
            s["kind"] = "llb"
            s["pool"] = llb
        elif t == "Elective":
            s["kind"] = "elective"
        elif t == "Choice":
            if "(see list)" in s["title"]:
                hits = resolve_pool(s["title"], components)
                if not hits:
                    raise SystemExit(f"Could not resolve choice pool for {s['rowKey']}: {s['title']}")
                s["kind"] = "pool"
                s["pool"] = hits
            else:
                opts = split_inline_choice(s["title"])
                if not opts:
                    raise SystemExit(f"Could not parse inline choice {s['rowKey']}: {s['title']}")
                s["kind"] = "inline"
                s["options"] = opts
        elif t == "Major (option)":
            prefix = option["majorCode"] + " "
            hits = [c["component"] for c in degree_sheet["catalogue"]
                    if c["code"] == s["code"] and c["component"].startswith(prefix)]
            hits = list(OrderedDict.fromkeys(hits))
            if not hits:
                raise SystemExit(f"Could not resolve option pool for {s['rowKey']}")
            s["kind"] = "option"
            s["pool"] = hits
        else:
            s["kind"] = "fixed"
    return slots


# --------------------------------------------------------------------------- QR codes

def qr_svg(url):
    try:
        import segno
    except ImportError:
        return None
    qr = segno.make(url, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", border=2, scale=1, xmldecl=False, svgns=True, nl=False,
            omitsize=True, dark="#1b2433", svgclass="qr", lineclass=None)
    return buf.getvalue().decode("utf-8")


# --------------------------------------------------------------------------- main

def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    wb = openpyxl.load_workbook(src, data_only=True)

    explorer = rows_of(wb["Pathway Explorer"])
    explorer_title = explorer[1][1]
    explorer_intro = explorer[2][1]
    legend = next(r[1] for r in explorer if r[1] and str(r[1]).startswith("Legend:"))
    campuses = parse_campus_legend(legend)

    overview, overview_note = extract_overview(wb["Overview"])
    options, dropdown, notes = extract_lists(wb["Lists"])
    pathways, pathway_rows = extract_pathway_data(wb["Pathway Data"])

    sheet_by_code = {}
    for ws in wb.worksheets:
        m = re.match(r"^(\d{4}) ", ws.title)
        if m:
            sheet_by_code[m.group(1)] = extract_degree_sheet(ws)

    option_by_key = {o["pathwayKey"]: o for o in options}
    for key, slots in pathways.items():
        deg = key.split("|")[0]
        enrich_pathway(slots, sheet_by_code[deg], option_by_key[key])

    degrees = []
    for d in overview:
        sheet = sheet_by_code[d["code"]]
        d.update({
            "label": next(o["degreeLabel"] for o in options if o["degree"] == d["code"]),
            "sheet": sheet["sheet"],
            "sheetIntro": sheet["intro"],
            "keyFacts": sheet["keyFacts"],
            "structure": sheet["structure"],
            "structureTotal": sheet["structureTotal"],
            "sheetPathways": sheet["pathways"],
            "majorSchedule": sheet["majorSchedule"],
            "catalogueNote": sheet.get("catalogueNote"),
            "catalogue": sheet["catalogue"],
            "sheetAdvisorNotes": sheet["advisorNotes"],
            "advisorNotes": notes.get(d["code"], {"raw": [], "parsed": []})["parsed"],
            "options": [o["pathwayKey"] for o in options if o["degree"] == d["code"]],
            "qrSvg": qr_svg(d["handbook"]),
        })
        for c in d["catalogue"]:
            c["autumnInfo"] = parse_offered(c["autumn"])
            c["springInfo"] = parse_offered(c["spring"])
        degrees.append(d)

    data = OrderedDict([
        ("meta", OrderedDict([
            ("title", explorer_title),
            ("explorerIntro", explorer_intro),
            ("overviewNote", overview_note),
            ("legend", legend),
            ("campuses", campuses),
            ("sourceWorkbook", src.name),
            ("extractedOn", date.today().isoformat()),
            ("counts", OrderedDict([
                ("degrees", len(degrees)),
                ("majorOptions", len(options)),
                ("pathways", len(pathways)),
                ("pathwayRows", pathway_rows),
                ("catalogueRows", sum(len(d["catalogue"]) for d in degrees)),
                ("advisorNotes", sum(len(n["raw"]) for n in notes.values())),
            ])),
        ])),
        ("degreeDropdown", dropdown),
        ("degrees", degrees),
        ("options", options),
        ("pathways", pathways),
    ])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    c = data["meta"]["counts"]
    print(f"Wrote {out_path} ({out_path.stat().st_size / 1024:.0f} KB): "
          f"{c['degrees']} degrees, {c['majorOptions']} degree/major options, {c['pathways']} pathways, "
          f"{c['pathwayRows']} pathway rows, {c['catalogueRows']} catalogue rows, {c['advisorNotes']} advisor notes"
          + ("" if degrees[0]["qrSvg"] else " (segno not installed: QR codes skipped)"))


if __name__ == "__main__":
    main()
