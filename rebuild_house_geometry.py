import bpy, json, os
from mathutils import Vector

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "solar-visualiser", "data", "rebuild-solid.json")
D = json.load(open(DATA))
PANELS = {p["id"]: p for p in D["panels"]}
STEPS = {s["wall"]: s for s in D.get("steps", [])}
T = 0.3
EAVE = D["eaveY"]

STOREY0 = {"w0": "IfcWall/Wall", "w1": "IfcWall/Wall.001", "w2": "IfcWall/Wall.002",
           "w3": "IfcWall/Wall.004", "w4": "IfcWall/Wall.005", "w5": "IfcWall/Wall.012"}
STOREY1 = {"w0": "IfcWall/Wall.006", "w1": "IfcWall/Wall.007", "w2": "IfcWall/Wall.008",
           "w3": "IfcWall/Wall.010", "w4": "IfcWall/Wall.011", "w5": "IfcWall/Wall.013"}
GABLES = {"w2": "IfcWall/Gable_w2", "w3": "IfcWall/Gable_w3",
          "w4": "IfcWall/Gable_w4", "w5": "IfcWall/Gable_w5"}
SLABS = ["IfcSlab/Slab", "IfcSlab/Slab.001", "IfcSlab/Slab.002"]
DEPRECATE = ["IfcWall/Wall.003", "IfcWall/Wall.009"]
ORDER = ["w0", "w1", "w2", "w3", "w4", "w5"]


def map2d(a, dirv, nrm, u, v):
    return (a[0] + dirv[0] * u + nrm[0] * v, a[1] + dirv[1] * u + nrm[1] * v)


def plan_polygon(pid):
    p = PANELS[pid]
    a, dirv, nrm, L = p["a"], p["dir"], p["normal"], p["len"]
    st = STEPS.get(pid)
    if st:
        u1, rec = st["u"], st["recess"]
        pts_uv = [(0, T / 2), (u1, T / 2), (u1, -rec + T / 2), (L, -rec + T / 2),
                  (L, -rec - T / 2), (u1, -rec - T / 2), (u1, -T / 2), (0, -T / 2)]
    else:
        pts_uv = [(0, T / 2), (L, T / 2), (L, -T / 2), (0, -T / 2)]
    return [map2d(a, dirv, nrm, u, v) for u, v in pts_uv]


def replace_mesh(name, verts, faces):
    ob = bpy.data.objects[name]
    me = ob.data
    new = bpy.data.meshes.new(me.name + "_rebuilt")
    new.from_pydata(verts, [], faces)
    new.validate()
    new.update()
    old = ob.data
    ob.data = new
    if old.users == 0:
        bpy.data.meshes.remove(old)
    ob.location = (0, 0, 0)
    ob.rotation_euler = (0, 0, 0)
    ob.scale = (1, 1, 1)
    ob.color = (0.9, 0.3, 0.1, 0.35)


def build_flat_prism(name, plan, z0, z1):
    verts, faces = [], []
    n = len(plan)
    for (x, y) in plan:
        verts.append((x, y, z0))
    for (x, y) in plan:
        verts.append((x, y, z1))
    faces.append(list(range(n - 1, -1, -1)))
    faces.append(list(range(n, 2 * n)))
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    replace_mesh(name, verts, faces)


def build_profile_prism(name, pid, z0):
    p = PANELS[pid]
    a, dirv, nrm = p["a"], p["dir"], p["normal"]
    prof = [(u, h) for u, h in p["topProfile"] if h > z0 + 1e-6]
    prof = [(0.0, z0)] + prof + [(p["len"], z0)]
    verts, faces = [], []
    for v in (-T / 2, T / 2):
        for (u, h) in prof:
            x, y = map2d(a, dirv, nrm, u, v)
            verts.append((x, y, h))
    n = len(prof)
    faces.append(list(range(n - 1, -1, -1)))
    faces.append(list(range(n, 2 * n)))
    for i in range(n - 1):
        faces.append([i, i + 1, n + i + 1, n + i])
    faces.append([0, n - 1, 2 * n - 1, n])
    replace_mesh(name, verts, faces)


def line_isect(pA, dA, pB, dB):
    den = dA.x * dB.y - dA.y * dB.x
    t = ((pB.x - pA.x) * dB.y - (pB.y - pA.y) * dB.x) / den
    return pA + dA * t


def corrected_footprint():
    fp = [list(p) for p in D["footprint"]]
    for wid, st in STEPS.items():
        pW = PANELS[wid]
        aW = Vector(pW["a"])
        dW = Vector(pW["dir"])
        nW = Vector(pW["normal"])
        nxt = ORDER[(ORDER.index(wid) + 1) % len(ORDER)]
        aN = Vector(PANELS[nxt]["a"])
        dN = Vector(PANELS[nxt]["dir"])
        u1, rec = st["u"], st["recess"]
        p_out = aW + dW * u1
        p_in = p_out - nW * rec
        corner = line_isect(p_in, dW, aN, dN)
        idx = None
        for i, p in enumerate(fp):
            if abs(p[0] - pW["a"][0]) < 1e-3 and abs(p[1] - pW["a"][1]) < 1e-3:
                idx = i
        if idx is None:
            raise RuntimeError(wid + " a-corner not found in footprint")
        j = (idx + 1) % len(fp)
        while not (abs(fp[j][0] - aN.x) < 1e-3 and abs(fp[j][1] - aN.y) < 1e-3):
            j = (j + 1) % len(fp)
        out = fp[:idx + 1]
        inserted = False
        for p in fp[idx + 1:j]:
            u = (p[0] - aW.x) * dW.x + (p[1] - aW.y) * dW.y
            if u > u1 and not inserted:
                out += [[p_out.x, p_out.y], [p_in.x, p_in.y]]
                inserted = True
            if u > u1:
                out.append([p[0] - nW.x * rec, p[1] - nW.y * rec])
            else:
                out.append(p)
        if not inserted:
            out += [[p_out.x, p_out.y], [p_in.x, p_in.y]]
        out.append([corner.x, corner.y])
        out += fp[j:]
        fp = out
    changed = True
    while changed:
        changed = False
        for i in range(len(fp)):
            a = Vector(fp[i - 1])
            b = Vector(fp[i])
            c = Vector(fp[(i + 1) % len(fp)])
            if (b - a).normalized().dot((c - b).normalized()) < -0.5:
                del fp[i]
                changed = True
                break
    return fp


def main():
    for pid, name in STOREY0.items():
        build_flat_prism(name, plan_polygon(pid), 0.0, 2.6)
    for pid, name in STOREY1.items():
        build_flat_prism(name, plan_polygon(pid), 2.6, EAVE)
    for pid, name in GABLES.items():
        build_profile_prism(name, pid, EAVE)
    fp = corrected_footprint()
    zs = [(0.0, 0.2), (2.6, 2.8), (EAVE, EAVE + 0.2)]
    for name, (z0, z1) in zip(SLABS, zs):
        build_flat_prism(name, fp, z0, z1)
    for name in DEPRECATE:
        ob = bpy.data.objects.get(name)
        if ob and not ob.name.startswith("DEPRECATED"):
            ob.location.z -= 100
            ob.name = "DEPRECATED_" + name.split("/")[-1]
    print("rebuilt ok, footprint verts:", len(fp))


main()
