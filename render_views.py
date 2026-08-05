import bpy
import os
import importlib.util
import shutil
from math import atan2
from mathutils import Vector
import bonsai.tool as tool

ROOT = os.path.dirname(os.path.abspath(__file__))
DRAWINGS = os.path.join(ROOT, 'drawings')

N3 = Vector((-0.42, 0.91, 0))
N4 = Vector((-0.91, -0.42, 0))

DRAWINGS_ORDER = [
    'GROUND FLOOR PLAN', 'FIRST FLOOR PLAN', 'SOUTH ELEVATION',
    'WEST ELEVATION', 'NORTH ELEVATION', 'EAST ELEVATION', 'ISOMETRIC',
]


def _load_sync():
    path = os.path.join(ROOT, 'sync_ifc_geometry.py')
    spec = importlib.util.spec_from_file_location('sync_ifc_geometry', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _center():
    slab = bpy.data.objects['IfcSlab/Slab']
    n = len(slab.data.vertices) // 2
    xs = [slab.data.vertices[i].co.x for i in range(n)]
    ys = [slab.data.vertices[i].co.y for i in range(n)]
    return Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0))


def _cam_of(name):
    ifc = tool.Ifc.get()
    el = [e for e in ifc.by_type('IfcAnnotation') if e.Name == name][0]
    return tool.Ifc.get_object(el)


def place_cameras():
    c = _center()
    rz = atan2(1.38 - (-1.58), 3.72 - (-3.66))
    eye = Vector((c.x, c.y, 3.2))

    def setup(name, loc, rot, scale, cs, ce):
        ob = _cam_of(name)
        ob.location = loc
        ob.rotation_euler = rot
        ob.data.ortho_scale = scale
        ob.data.clip_start = cs
        ob.data.clip_end = ce

    setup('GROUND FLOOR PLAN', (c.x, c.y, 1.6), (0, 0, rz), 18, 0.4, 50)
    setup('FIRST FLOOR PLAN', (c.x, c.y, 4.2), (0, 0, rz), 18, 0.4, 50)
    for name, nv in (('SOUTH ELEVATION', N3), ('WEST ELEVATION', N4),
                     ('NORTH ELEVATION', -N3), ('EAST ELEVATION', -N4)):
        loc = eye + nv * 40
        rot = (eye - loc).to_track_quat('-Z', 'Y').to_euler()
        setup(name, loc, rot, 18, 0.01, 100)
    d = (N3 + N4 + Vector((0, 0, 0.9))).normalized()
    loc = eye + d * 40
    setup('ISOMETRIC', loc, (eye - loc).to_track_quat('-Z', 'Y').to_euler(), 20, 0.01, 100)


def regenerate(names=None):
    prefs = tool.Blender.get_addon_preferences().doc
    prefs.drawings_dir = DRAWINGS
    sync = _load_sync()
    sync.sync_all()
    place_cameras()
    ifc = tool.Ifc.get()
    for name in DRAWINGS_ORDER:
        if names and name not in names:
            continue
        bpy.context.scene.camera = _cam_of(name)
        bpy.ops.bim.create_drawing(sync=False)
    src = os.path.join(DRAWINGS, 'ORTHOGRAPHIC.svg')
    dst = os.path.join(DRAWINGS, 'ISOMETRIC.svg')
    if os.path.isfile(src):
        shutil.copyfile(src, dst)


if __name__ == '__main__':
    regenerate()
