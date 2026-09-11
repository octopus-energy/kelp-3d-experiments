"""JSON, CSV-friendly payloads, and a self-contained visual HTML report."""

from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any


def _number(value: Any, digits: int = 1) -> str:
    if value is None:
        return "—"
    try:
        return f"{float(value):,.{digits}f}"
    except (TypeError, ValueError):
        return html.escape(str(value))


def _points(points: list[list[float]]) -> str:
    return " ".join(f"{float(point[0]):.1f},{float(point[1]):.1f}" for point in points if len(point) >= 2)


def _role_class(role: str | None, exterior: bool) -> str:
    normalised = (role or "").replace("_", "").lower()
    if "party" in normalised:
        return "party"
    if "sheltered" in normalised:
        return "sheltered"
    if "internal" in normalised:
        return "internal"
    if "alternative" in normalised:
        return "alternative"
    return "external" if exterior or normalised in {"external", "heatlossperimeter"} else "unknown"


def _floorplan_svg(floor: dict[str, Any], payload: dict[str, Any]) -> str:
    room_results = {str(room["id"]): room for room in payload["calculation"]["rooms"]}
    room_ids = payload["mapping"]["room_ids"]
    rooms = floor.get("rooms", [])
    all_points = [point for room in rooms for point in room.get("polygon", []) if len(point) >= 2]
    if not all_points:
        return '<p class="muted">No polygon geometry was returned for this floor.</p>'
    xs = [float(point[0]) for point in all_points]
    ys = [float(point[1]) for point in all_points]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 100)
    padding = span * 0.06
    view_box = f"{min(xs)-padding:.1f} {min(ys)-padding:.1f} {max(xs)-min(xs)+2*padding:.1f} {max(ys)-min(ys)+2*padding:.1f}"
    label_size = max(12, min(30, span / 32))

    watt_per_m2: list[float] = []
    for room in rooms:
        result = room_results.get(str(room_ids.get(str(room.get("id")), "")), {})
        area = float(result.get("area") or 0)
        if area:
            watt_per_m2.append(float(result.get("total_heatloss") or 0) / area)
    upper = max(watt_per_m2, default=1)

    shapes: list[str] = []
    for room in rooms:
        raw_id = str(room.get("id"))
        result = room_results.get(str(room_ids.get(raw_id, "")), {})
        area = float(result.get("area") or 0)
        intensity = min(1.0, (float(result.get("total_heatloss") or 0) / area / upper) if area else 0)
        lightness = 93 - intensity * 43
        name = html.escape(str(room.get("name") or raw_id))
        polygon = _points(room.get("polygon", []))
        shapes.append(
            f'<polygon class="room-shape" points="{polygon}" style="fill:hsl(18 82% {lightness:.1f}%)">'
            f"<title>{name}: {_number(result.get('total_heatloss'), 0)} W</title></polygon>"
        )
        for wall in room.get("walls", []):
            role = _role_class(wall.get("role"), bool(wall.get("exterior")))
            shapes.append(
                f'<polyline class="wall {role}" points="{_points(wall.get("points", []))}">'
                f"<title>{name}: {html.escape(str(wall.get('role') or role))}</title></polyline>"
            )
        for opening in room.get("windows", []):
            shapes.append(
                f'<polyline class="opening window" points="{_points(opening.get("points", []))}"><title>{name}: window</title></polyline>'
            )
        for opening in room.get("doors", []):
            shapes.append(
                f'<polyline class="opening door" points="{_points(opening.get("points", []))}"><title>{name}: door</title></polyline>'
            )

        center = room.get("center") or []
        if len(center) >= 2:
            x, y = float(center[0]), float(center[1])
            heatloss = _number(result.get("total_heatloss"), 0)
            shapes.append(
                f'<text class="room-label" x="{x:.1f}" y="{y:.1f}" style="font-size:{label_size:.1f}px">'
                f'<tspan x="{x:.1f}" dy="-0.2em">{name}</tspan>'
                f'<tspan x="{x:.1f}" dy="1.2em">{heatloss} W</tspan></text>'
            )

    title = html.escape(str(floor.get("name") or f"Floor {floor.get('level', 0)}"))
    return (
        f'<section class="floor"><h3>{title}</h3>'
        f'<svg class="floorplan" viewBox="{view_box}" role="img" aria-label="{title} floor plan coloured by heat loss">'
        + "".join(shapes)
        + "</svg></section>"
    )


def _vertical_view_data(payload: dict[str, Any], geometry: dict[str, Any]) -> dict[str, Any]:
    assignments = payload.get("mapping", {}).get("vertical_assignments", {})
    metadata = payload.get("mapping", {}).get("room_metadata", {})
    floors = []
    for floor in geometry.get("floors") or []:
        position = floor.get("position") or [0, 0, 0]
        while len(position) < 3:
            position.append(0)
        rooms = []
        for room in floor.get("rooms") or []:
            room_id = str(room.get("id"))
            polygon = [
                [float(point[0]), float(point[1])]
                for point in (room.get("polygon") or [])
                if len(point) >= 2
            ]
            if not polygon:
                continue
            center = room.get("center") or []
            if len(center) < 2:
                center = [
                    sum(point[0] for point in polygon) / len(polygon),
                    sum(point[1] for point in polygon) / len(polygon),
                ]
            rooms.append(
                {
                    "id": room_id,
                    "name": str(room.get("name") or metadata.get(room_id, {}).get("name") or room_id),
                    "polygon": polygon,
                    "center": [float(center[0]), float(center[1])],
                    "area_m2": float(metadata.get(room_id, {}).get("area_m2") or 0),
                    "assignment": assignments.get(room_id, {"floor": [], "ceiling": []}),
                }
            )
        floors.append(
            {
                "level": int(floor.get("level", 0)),
                "name": str(floor.get("name") or f"Floor {floor.get('level', 0)}"),
                "rotation": float(floor.get("rotation") or 0),
                "position": [float(position[0]), float(position[1]), float(position[2])],
                "rooms": rooms,
            }
        )

    links = []
    for room_id, assignment in assignments.items():
        for section in assignment.get("ceiling") or []:
            adjacent_id = section.get("adjacent_room_id")
            if adjacent_id:
                links.append(
                    {
                        "from": str(room_id),
                        "to": str(adjacent_id),
                        "area_m2": float(section.get("area_m2") or 0),
                    }
                )
    return {"floors": floors, "links": links}


def _vertical_styles() -> str:
    return """
.vertical-controls { display:flex; flex-wrap:wrap; align-items:end; gap:14px; margin:14px 0; }
.vertical-controls label { display:grid; gap:5px; color:var(--muted); min-width:0; }
.vertical-controls select,.vertical-controls input { font:inherit; color:var(--text); background:var(--panel); border:1px solid var(--line); padding:7px 9px; min-width:0; max-width:100%; }
.vertical-check { display:flex !important; grid-auto-flow:column; align-items:center; min-height:40px; }
.vertical-grid { display:grid; grid-template-columns:minmax(0,2.3fr) minmax(260px,1fr); gap:16px; align-items:start; }
.vertical-stage,.vertical-detail { min-width:0; }
.vertical-svg { width:100%; min-height:480px; background:color-mix(in srgb,var(--panel) 90%,transparent); border:1px solid var(--line); }
.vertical-room { stroke:color-mix(in srgb,var(--text) 70%,transparent); stroke-width:1.4; vector-effect:non-scaling-stroke; cursor:pointer; transition:opacity .15s,stroke-width .15s; }
.vertical-room.vertical-adjacent { fill:#36a075; }
.vertical-room.vertical-ground { fill:#3f83c5; }
.vertical-room.vertical-external { fill:#d88924; }
.vertical-room.vertical-mixed { fill:#8a63c5; }
.vertical-room.is-selected { stroke:var(--text); stroke-width:4; }
.vertical-link { stroke:#5e7078; stroke-opacity:.25; fill:none; vector-effect:non-scaling-stroke; }
.vertical-link.is-selected { stroke:var(--accent); stroke-opacity:.95; }
.vertical-floor-label { fill:var(--text); paint-order:stroke; stroke:var(--panel); stroke-width:4px; font-weight:600; }
.vertical-detail { background:color-mix(in srgb,var(--panel) 90%,var(--bg)); border:1px solid var(--line); padding:14px; min-height:210px; }
.vertical-detail h3 { margin-top:0; }
.vertical-detail h4 { margin:16px 0 6px; }
.vertical-detail table { font-size:.92rem; }
.vertical-legend { display:flex; flex-wrap:wrap; gap:12px; margin-top:9px; color:var(--muted); }
.vertical-legend i { width:14px; height:14px; display:inline-block; margin-right:5px; vertical-align:-2px; }
.vertical-legend .adjacent { background:#36a075; }.vertical-legend .ground { background:#3f83c5; }.vertical-legend .external-surface { background:#d88924; }.vertical-legend .mixed { background:#8a63c5; }
.vertical-audit { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-top:14px; }
.vertical-audit div { border-top:1px solid var(--line); padding-top:9px; }.vertical-audit span { display:block; color:var(--muted); }.vertical-audit strong { font-size:1.15rem; }
@media(max-width:760px) { .vertical-grid { grid-template-columns:1fr; }.vertical-svg { min-height:400px; }.vertical-controls label { width:100%; }.vertical-controls select,.vertical-controls input[type="range"] { width:100%; } }
"""


def _vertical_assignment_view(payload: dict[str, Any], geometry: dict[str, Any]) -> str:
    data_json = json.dumps(_vertical_view_data(payload, geometry), separators=(",", ":")).replace("</", "<\\/")
    audit = payload.get("api_audit", {})
    heading = f"""
<section class="panel" id="vertical-assignment-panel"><h2>3D floor and ceiling assignments</h2>
<p class="subtle">Exploded floor stack showing the exact vertical sections passed to the heat-loss calculator. Select a room to inspect its assigned surfaces and linked rooms.</p>
<div class="vertical-controls">
  <label>Colour by<select id="vertical-mode"><option value="ceiling">Ceiling assignment</option><option value="floor">Floor assignment</option></select></label>
  <label>Room<select id="vertical-room-select"></select></label>
  <label>Rotation<input id="vertical-yaw" type="range" min="-70" max="70" value="-32"></label>
  <label>Floor spacing<input id="vertical-spacing" type="range" min="45" max="150" value="92"></label>
  <label class="vertical-check"><input id="vertical-links" type="checkbox" checked> Show assigned links</label>
</div>
<div class="vertical-grid"><div class="vertical-stage">
  <svg id="vertical-svg" class="vertical-svg" viewBox="0 0 940 590" role="img" aria-label="Interactive three-dimensional exploded floor alignment"></svg>
  <div class="vertical-legend"><span><i class="adjacent"></i>Fully adjacent</span><span><i class="ground"></i>Ground</span><span><i class="external-surface"></i>Roof / exposed floor</span><span><i class="mixed"></i>Mixed assignment</span></div>
</div><aside id="vertical-detail" class="vertical-detail" aria-live="polite"></aside></div>
<div class="vertical-audit">
  <div><span>Vertical room pairs</span><strong>{int(audit.get('vertical_pair_count') or 0)}</strong></div>
  <div><span>Pair area agreement</span><strong>{_number(audit.get('vertical_pair_balance_pct'))}%</strong></div>
  <div><span>Roof assigned below top floor</span><strong>{_number(audit.get('lower_level_roof_area_m2'))} m²</strong></div>
  <div><span>Exposed floor above ground</span><strong>{_number(audit.get('upper_level_exposed_floor_area_m2'))} m²</strong></div>
</div>
</section>
<script type="application/json" id="vertical-view-data">""" + data_json + """</script>
<script>
(() => {
  const dataNode = document.getElementById('vertical-view-data');
  const svg = document.getElementById('vertical-svg');
  if (!dataNode || !svg) return;
  const data = JSON.parse(dataNode.textContent);
  const modeControl = document.getElementById('vertical-mode');
  const roomControl = document.getElementById('vertical-room-select');
  const yawControl = document.getElementById('vertical-yaw');
  const spacingControl = document.getElementById('vertical-spacing');
  const linkControl = document.getElementById('vertical-links');
  const detail = document.getElementById('vertical-detail');
  const NS = 'http://www.w3.org/2000/svg';
  const rooms = [];
  const roomById = new Map();
  data.floors.forEach(floor => floor.rooms.forEach(room => {
    room.floor = floor;
    rooms.push(room);
    roomById.set(room.id, room);
  }));
  rooms.sort((a,b) => a.floor.level-b.floor.level || a.name.localeCompare(b.name));
  rooms.forEach(room => {
    const option = document.createElement('option');
    option.value = room.id;
    option.textContent = `${room.floor.name} · ${room.name}`;
    roomControl.appendChild(option);
  });
  let selectedId = rooms[0]?.id || null;

  function svgNode(name, attributes = {}) {
    const node = document.createElementNS(NS, name);
    Object.entries(attributes).forEach(([key,value]) => node.setAttribute(key, String(value)));
    return node;
  }
  function worldPoint(point, floor) {
    const angle = floor.rotation * Math.PI / 180;
    return [
      point[0] * Math.cos(angle) - point[1] * Math.sin(angle) + floor.position[0],
      point[0] * Math.sin(angle) + point[1] * Math.cos(angle) + floor.position[2],
      Math.abs(floor.position[1]) || Math.max(0, floor.level) * 300,
    ];
  }
  function assignmentClass(room, mode) {
    const sections = room.assignment?.[mode] || [];
    const adjacent = sections.filter(item => item.boundary === 'adjacent_room').reduce((sum,item) => sum + item.area_m2, 0);
    const external = sections.reduce((sum,item) => sum + item.area_m2, 0) - adjacent;
    if (adjacent > .05 && external > .05) return 'vertical-mixed';
    if (adjacent > .05) return 'vertical-adjacent';
    if (mode === 'floor' && sections.some(item => item.boundary === 'ground')) return 'vertical-ground';
    return 'vertical-external';
  }
  function sectionRows(room, mode) {
    const sections = room.assignment?.[mode] || [];
    if (!sections.length) return '<tr><td colspan="2">No assignment</td></tr>';
    return sections.map(section => {
      const adjacent = section.adjacent_room_id ? roomById.get(section.adjacent_room_id) : null;
      const label = adjacent ? adjacent.name : section.boundary.replaceAll('_',' ');
      return `<tr><td>${escapeHtml(label)}</td><td class="number">${section.area_m2.toFixed(2)} m²</td></tr>`;
    }).join('');
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  }
  function updateDetail() {
    const room = roomById.get(selectedId);
    if (!room) { detail.textContent = 'No room geometry available.'; return; }
    detail.innerHTML = `<h3>${escapeHtml(room.name)}</h3><div class="subtle">${escapeHtml(room.floor.name)} · measured area ${room.area_m2.toFixed(2)} m²</div>` +
      `<h4>Floor assignment</h4><table><tbody>${sectionRows(room,'floor')}</tbody></table>` +
      `<h4>Ceiling assignment</h4><table><tbody>${sectionRows(room,'ceiling')}</tbody></table>`;
  }
  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!rooms.length) { svg.appendChild(svgNode('text',{x:30,y:50})).textContent='No room polygons returned.'; return; }
    const yaw = Number(yawControl.value) * Math.PI / 180;
    const spacing = Number(spacingControl.value) / 100;
    const projectRaw = point => {
      const horizontal = point[0] * Math.cos(yaw) - point[1] * Math.sin(yaw);
      const depth = point[0] * Math.sin(yaw) + point[1] * Math.cos(yaw);
      return [horizontal, depth * .48 - point[2] * .58 * spacing];
    };
    const projectedRooms = rooms.map(room => ({
      room,
      points: room.polygon.map(point => projectRaw(worldPoint(point,room.floor))),
      center: projectRaw(worldPoint(room.center,room.floor)),
    }));
    const all = projectedRooms.flatMap(item => item.points);
    const xs = all.map(point => point[0]), ys = all.map(point => point[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const scale=Math.min(820/Math.max(1,maxX-minX),500/Math.max(1,maxY-minY));
    const offsetX=70-minX*scale, offsetY=45-minY*scale;
    const screen = point => [point[0]*scale+offsetX,point[1]*scale+offsetY];
    const projectedById = new Map(projectedRooms.map(item => [item.room.id,item]));
    const related = new Set([selectedId]);
    data.links.forEach(link => { if (link.from===selectedId) related.add(link.to); if (link.to===selectedId) related.add(link.from); });

    if (linkControl.checked) data.links.forEach(link => {
      const from=projectedById.get(link.from), to=projectedById.get(link.to);
      if (!from || !to) return;
      const a=screen(from.center), b=screen(to.center);
      const active=link.from===selectedId || link.to===selectedId;
      const line=svgNode('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1],class:`vertical-link${active?' is-selected':''}`,'stroke-width':Math.max(1,Math.min(8,link.area_m2/2.5))});
      const title=svgNode('title'); title.textContent=`${from.room.name} ↔ ${to.room.name}: ${link.area_m2.toFixed(2)} m²`; line.appendChild(title); svg.appendChild(line);
    });

    [...data.floors].sort((a,b)=>a.level-b.level).forEach(floor => {
      const floorRooms=projectedRooms.filter(item=>item.room.floor===floor);
      floorRooms.forEach(item => {
        const points=item.points.map(screen).map(point=>point.join(',')).join(' ');
        const dimmed=selectedId && !related.has(item.room.id);
        const polygon=svgNode('polygon',{points,class:`vertical-room ${assignmentClass(item.room,modeControl.value)}${item.room.id===selectedId?' is-selected':''}`,opacity:dimmed?.28:.86});
        const title=svgNode('title'); title.textContent=`${floor.name} · ${item.room.name}`; polygon.appendChild(title);
        polygon.addEventListener('click',()=>{ selectedId=item.room.id; roomControl.value=selectedId; render(); });
        svg.appendChild(polygon);
      });
      if (floorRooms.length) {
        const anchor=screen([Math.min(...floorRooms.flatMap(item=>item.points.map(point=>point[0]))),Math.min(...floorRooms.flatMap(item=>item.points.map(point=>point[1])))]);
        const label=svgNode('text',{x:anchor[0]+4,y:anchor[1]-8,class:'vertical-floor-label'}); label.textContent=floor.name; svg.appendChild(label);
      }
    });
    updateDetail();
  }
  roomControl.addEventListener('change',()=>{selectedId=roomControl.value;render();});
  modeControl.addEventListener('change',render);
  yawControl.addEventListener('input',render);
  spacingControl.addEventListener('input',render);
  linkControl.addEventListener('change',render);
  if (selectedId) roomControl.value=selectedId;
  render();
})();
</script>"""
    return heading


def render_html(payload: dict[str, Any], geometry: dict[str, Any]) -> str:
    calculation = payload["calculation"]
    audit = payload["api_audit"]
    metadata_by_engine_id = {
        str(metadata["engine_room_id"]): metadata
        for metadata in payload["mapping"]["room_metadata"].values()
    }
    room_rows = []
    for room in calculation["rooms"]:
        metadata = metadata_by_engine_id.get(str(room["id"]), {})
        direct_url = metadata.get("direct_url")
        room_name = html.escape(str(room["name"]))
        if direct_url:
            room_name = f'<a href="{html.escape(str(direct_url), quote=True)}">{room_name}</a>'
        room_rows.append(
            "<tr>"
            f"<td>{room_name}</td>"
            f"<td>{html.escape(str(metadata.get('engine_room_type') or ''))}</td>"
            f"<td>{'Yes' if room.get('is_heated') else 'No'}</td>"
            f'<td class="number">{_number(room.get("area"))}</td>'
            f'<td class="number">{_number(room.get("fabric_heatloss"), 0)}</td>'
            f'<td class="number">{_number(room.get("ventilation_heatloss"), 0)}</td>'
            f'<td class="number"><strong>{_number(room.get("total_heatloss"), 0)}</strong></td>'
            "</tr>"
        )

    audit_rows = []
    audit_labels = {
        "room_match_coverage_pct": "Room measurement match",
        "wall_role_coverage_pct": "Walls with a role",
        "opening_wall_link_coverage_pct": "Openings linked to walls",
    }
    for key, label in audit_labels.items():
        value = float(audit.get(key) or 0)
        audit_rows.append(
            f'<div class="audit-row"><span>{label}</span><div class="audit-track"><span style="width:{max(0,min(100,value)):.1f}%"></span></div><strong>{value:.1f}%</strong></div>'
        )

    assumption = next(iter(payload["mapping"]["assumptions_by_room"].values()), {}).get("u_values", {})
    assumption_rows = "".join(
        f"<tr><td>{html.escape(key.replace('_', ' ').title())}</td><td class=\"number\">{_number(value, 2)}</td></tr>"
        for key, value in assumption.items()
    )
    warning_items = "".join(f"<li>{html.escape(warning)}</li>" for warning in payload["warnings"])
    if not warning_items:
        warning_items = "<li>No adapter warnings.</li>"
    floorplans = "".join(_floorplan_svg(floor, payload) for floor in geometry.get("floors", []))
    vertical_view = _vertical_assignment_view(payload, geometry)
    vertical_styles = _vertical_styles()
    source = payload["source"]

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vieweet heat-loss report — {html.escape(str(source['tour_code']))}</title>
<style>
:root {{ color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; --bg:#f5f7f8; --panel:#fff; --text:#152128; --muted:#607079; --line:#dce3e7; --accent:#007d79; }}
@media(prefers-color-scheme:dark) {{ :root {{ --bg:#111719; --panel:#192124; --text:#ecf3f4; --muted:#aab8bd; --line:#344147; --accent:#63d5cf; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); }} main {{ max-width:1180px; margin:auto; padding:28px 20px 56px; }}
h1,h2,h3 {{ font-weight:600; }} h1 {{ margin-bottom:4px; }} .subtle,.muted {{ color:var(--muted); }}
.summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:22px 0; }}
.metric,.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; }} .metric {{ padding:16px; }} .metric span {{ display:block; color:var(--muted); }} .metric strong {{ font-size:1.6rem; }}
.panel {{ padding:18px; margin:16px 0; }} .legend {{ display:flex; flex-wrap:wrap; gap:14px; margin:8px 0 14px; }} .key {{ display:inline-flex; align-items:center; gap:6px; }} .swatch {{ width:22px; height:5px; display:inline-block; }}
.floor {{ margin:20px 0 30px; }} .floorplan {{ width:100%; max-height:620px; background:color-mix(in srgb,var(--panel) 90%,transparent); border:1px solid var(--line); }}
.room-shape {{ stroke:var(--panel); stroke-width:3; vector-effect:non-scaling-stroke; }} .wall {{ fill:none; stroke-width:4; vector-effect:non-scaling-stroke; }}
.external {{ stroke:#d83c3c; }} .party {{ stroke:#7554c8; }} .sheltered {{ stroke:#d99120; }} .internal {{ stroke:#75848b; }} .alternative {{ stroke:#d34d9b; }} .unknown {{ stroke:#222; }}
.swatch.external {{ background:#d83c3c; }} .swatch.party {{ background:#7554c8; }} .swatch.sheltered {{ background:#d99120; }} .swatch.internal {{ background:#75848b; }} .swatch.window {{ background:#1686d9; }} .swatch.door {{ background:#24a66a; }}
.opening {{ fill:none; stroke-width:7; vector-effect:non-scaling-stroke; }} .window {{ stroke:#1686d9; }} .door {{ stroke:#24a66a; }}
.room-label {{ text-anchor:middle; dominant-baseline:middle; fill:#111; paint-order:stroke; stroke:#fff; stroke-width:3px; stroke-linejoin:round; }}
.table-wrap {{ overflow-x:auto; }} table {{ width:100%; border-collapse:collapse; }} th,td {{ padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; }} th {{ color:var(--muted); }} .number {{ text-align:right; font-variant-numeric:tabular-nums; }}
.audit-row {{ display:grid; grid-template-columns:minmax(160px,1fr) 3fr 64px; gap:10px; align-items:center; margin:10px 0; }} .audit-track {{ height:10px; background:var(--line); border-radius:99px; overflow:hidden; }} .audit-track span {{ display:block; height:100%; background:var(--accent); }}
.columns {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; }} a {{ color:var(--accent); }} code {{ font-family:ui-monospace,monospace; }}
@media(max-width:600px) {{ .audit-row {{ grid-template-columns:1fr 52px; }} .audit-track {{ grid-column:1/-1; grid-row:2; }} .room-label {{ display:none; }} }}
{vertical_styles}
</style>
</head>
<body><main>
<h1>Heat-loss proof of concept</h1>
<div class="subtle">Tour <code>{html.escape(str(source['tour_code']))}</code> · {html.escape(str(source.get('address') or 'Address unavailable'))} · postcode {html.escape(str(source.get('postcode') or '—'))}</div>
<div class="summary">
  <div class="metric"><span>Total design heat loss</span><strong>{_number(calculation['total_heatloss']/1000, 2)} kW</strong></div>
  <div class="metric"><span>Modelled floor area</span><strong>{_number(calculation['total_floor_sqm'])} m²</strong></div>
  <div class="metric"><span>Rooms returned</span><strong>{len(calculation['rooms'])}</strong></div>
  <div class="metric"><span>Adapter warnings</span><strong>{len(payload['warnings'])}</strong></div>
</div>
{vertical_view}
<section class="panel"><h2>Mapped geometry and room load</h2>
<div class="legend"><span class="key"><i class="swatch external"></i>External</span><span class="key"><i class="swatch party"></i>Party</span><span class="key"><i class="swatch sheltered"></i>Sheltered</span><span class="key"><i class="swatch internal"></i>Internal</span><span class="key"><i class="swatch window"></i>Window</span><span class="key"><i class="swatch door"></i>Door</span></div>
{floorplans}</section>
<section class="panel"><h2>Wall-role treatment</h2><div class="table-wrap"><table><thead><tr><th>Vieweet role</th><th>Engine representation</th><th>Prototype boundary</th></tr></thead><tbody>
<tr><td>external / heatLossPerimeter / alternative</td><td>ExternalWall</td><td>Outdoor design temperature</td></tr>
<tr><td>party</td><td>PartyWall</td><td>Existing engine fixed 11 K temperature difference</td></tr>
<tr><td>shelteredWall</td><td>ShelteredWall</td><td>11°C unheated-zone boundary</td></tr>
<tr><td>internal</td><td>InternalWall</td><td>Matched neighbour temperature; zero-loss when unresolved</td></tr>
</tbody></table></div></section>
<section class="panel"><h2>Room calculations</h2><div class="table-wrap"><table><thead><tr><th>Room</th><th>Mapped type</th><th>Heated</th><th class="number">Area m²</th><th class="number">Fabric W</th><th class="number">Ventilation W</th><th class="number">Total W</th></tr></thead><tbody>{''.join(room_rows)}</tbody></table></div></section>
<div class="columns">
<section class="panel"><h2>API quality checks</h2>{''.join(audit_rows)}<table><tbody><tr><td>Floors</td><td class="number">{audit['floor_count']}</td></tr><tr><td>Walls</td><td class="number">{audit['wall_count']}</td></tr><tr><td>Openings</td><td class="number">{audit['opening_count']}</td></tr><tr><td>Room area vs NIA difference</td><td class="number">{_number(audit.get('room_area_vs_nia_delta_pct'))}%</td></tr></tbody></table></section>
<section class="panel"><h2>Baseline U-values</h2><table><thead><tr><th>Element</th><th class="number">W/(m²·K)</th></tr></thead><tbody>{assumption_rows}</tbody></table></section>
</div>
<section class="panel"><h2>Mapping warnings</h2><ul>{warning_items}</ul></section>
<p class="subtle">This is a geometry-to-engine integration proof of concept. Fabric values are assumptions, not a surveyed fabric assessment.</p>
</main></body></html>"""


def write_property_report(
    output_directory: Path,
    payload: dict[str, Any],
    geometry: dict[str, Any],
) -> tuple[Path, Path]:
    output_directory.mkdir(parents=True, exist_ok=True)
    json_path = output_directory / "heatloss.json"
    html_path = output_directory / "report.html"
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    html_path.write_text(render_html(payload, geometry), encoding="utf-8")
    return json_path, html_path


def render_summary_html(rows: list[dict[str, Any]]) -> str:
    successful = [row for row in rows if row.get("status") == "ok"]
    failed = [row for row in rows if row.get("status") != "ok"]
    maximum = max((float(row.get("total_heatloss_w") or 0) for row in successful), default=1)
    bars = []
    for row in sorted(successful, key=lambda item: float(item.get("total_heatloss_w") or 0), reverse=True):
        value = float(row.get("total_heatloss_w") or 0)
        width = value / maximum * 100
        report = html.escape(str(row.get("report") or ""), quote=True)
        code = html.escape(str(row.get("tour_code") or ""))
        bars.append(
            f'<div class="bar-row"><a href="{report}">{code}</a><div class="track"><span style="width:{width:.1f}%"></span></div><strong>{value/1000:.2f} kW</strong></div>'
        )
    if not bars:
        bars.append('<p class="muted">No property calculations completed yet.</p>')

    table_rows = []
    for row in rows:
        status = html.escape(str(row.get("status") or ""))
        code = html.escape(str(row.get("tour_code") or ""))
        report = row.get("report")
        if report:
            code = f'<a href="{html.escape(str(report), quote=True)}">{code}</a>'
        table_rows.append(
            "<tr>"
            f"<td>{code}</td>"
            f"<td>{html.escape(str(row.get('address') or ''))}</td>"
            f"<td>{status}</td>"
            f"<td class=\"number\">{_number(row.get('modelled_floor_area_m2'))}</td>"
            f"<td class=\"number\">{_number(float(row['total_heatloss_w'])/1000, 2) if row.get('total_heatloss_w') not in ('', None) else '—'}</td>"
            f"<td>{html.escape(str(row.get('error') or ''))}</td>"
            "</tr>"
        )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vieweet heat-loss batch</title><style>
:root {{ color-scheme:light dark; font-family:Inter,ui-sans-serif,system-ui,sans-serif; --bg:#f5f7f8; --panel:#fff; --text:#152128; --muted:#607079; --line:#dce3e7; --accent:#007d79; --bad:#c03a3a; }}
@media(prefers-color-scheme:dark) {{ :root {{ --bg:#111719; --panel:#192124; --text:#ecf3f4; --muted:#aab8bd; --line:#344147; --accent:#63d5cf; --bad:#ff8888; }} }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:var(--bg); color:var(--text); }} main {{ max-width:1180px; margin:auto; padding:28px 20px 56px; }} h1,h2 {{ font-weight:600; }} .muted {{ color:var(--muted); }}
.summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:22px 0; }} .metric,.panel {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; }} .metric {{ padding:16px; }} .metric span {{ display:block; color:var(--muted); }} .metric strong {{ font-size:1.6rem; }} .panel {{ padding:18px; margin:16px 0; }}
.bar-row {{ display:grid; grid-template-columns:90px minmax(160px,1fr) 80px; align-items:center; gap:10px; margin:10px 0; }} .track {{ height:14px; background:var(--line); }} .track span {{ display:block; height:100%; background:var(--accent); }}
.table-wrap {{ overflow-x:auto; }} table {{ width:100%; border-collapse:collapse; }} th,td {{ padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }} th {{ color:var(--muted); }} td:last-child {{ max-width:420px; overflow-wrap:anywhere; }} .number {{ text-align:right; font-variant-numeric:tabular-nums; }} a {{ color:var(--accent); }}
@media(max-width:560px) {{ .bar-row {{ grid-template-columns:76px 1fr; }} .bar-row strong {{ grid-column:2; }} }}
</style></head><body><main>
<h1>Vieweet heat-loss batch</h1><p class="muted">Proof-of-concept geometry adapter using configurable fabric assumptions.</p>
<div class="summary"><div class="metric"><span>CSV properties</span><strong>{len(rows)}</strong></div><div class="metric"><span>Calculated</span><strong>{len(successful)}</strong></div><div class="metric"><span>Failed</span><strong>{len(failed)}</strong></div></div>
<section class="panel"><h2>Design heat loss by property</h2>{''.join(bars)}</section>
<section class="panel"><h2>Batch status</h2><div class="table-wrap"><table><thead><tr><th>Tour</th><th>Address</th><th>Status</th><th class="number">Area m²</th><th class="number">Heat loss kW</th><th>Error</th></tr></thead><tbody>{''.join(table_rows)}</tbody></table></div></section>
</main></body></html>"""


def write_summary_report(output_directory: Path, rows: list[dict[str, Any]]) -> Path:
    path = output_directory / "index.html"
    path.write_text(render_summary_html(rows), encoding="utf-8")
    return path
