import bpy
from mathutils import Matrix, Vector
import bonsai.tool as tool

SYNC = [
    'IfcRoof/Roof', 'IfcSlab/Slab', 'IfcSlab/Slab.001', 'IfcSlab/Slab.002',
    'IfcWall/Gable_w2', 'IfcWall/Gable_w3', 'IfcWall/Gable_w4', 'IfcWall/Gable_w5',
    'IfcWall/Wall', 'IfcWall/Wall.001', 'IfcWall/Wall.002', 'IfcWall/Wall.004',
    'IfcWall/Wall.005', 'IfcWall/Wall.006', 'IfcWall/Wall.007', 'IfcWall/Wall.008',
    'IfcWall/Wall.010', 'IfcWall/Wall.011', 'IfcWall/Wall.012', 'IfcWall/Wall.013',
]


def axis_matrix(ap):
    if ap is None:
        return Matrix.Identity(4)
    loc = Vector(ap.Location.Coordinates) if ap.Location else Vector((0, 0, 0))
    z = Vector(ap.Axis.DirectionRatios) if ap.Axis else Vector((0, 0, 1))
    z.normalize()
    if ap.RefDirection:
        x = Vector(ap.RefDirection.DirectionRatios)
    else:
        x = Vector((0, 1, 0)) if abs(z.z) > 0.9 else Vector((0, 0, 1))
    x = (x - z * x.dot(z))
    if x.length < 1e-9:
        x = Vector((1, 0, 0)) - z * z.x
    x.normalize()
    y = z.cross(x)
    m = Matrix.Identity(4)
    m.col[0][:3] = x
    m.col[1][:3] = y
    m.col[2][:3] = z
    m.col[3][:3] = loc
    return m


def global_placement(el):
    stack = []
    pl = el.ObjectPlacement
    while pl is not None and pl.is_a() == 'IfcLocalPlacement':
        stack.append(axis_matrix(pl.RelativePlacement))
        pl = pl.PlacementRelTo
    m = Matrix.Identity(4)
    for s in reversed(stack):
        m = m @ s
    return m


def sync_element(ifc, ob, el):
    body = None
    for r in el.Representation.Representations:
        if r.ContextOfItems.ContextIdentifier == 'Body':
            body = r
    assert body, ob.name
    E = global_placement(el)
    M = E.inverted() @ ob.matrix_world
    verts = [M @ v.co for v in ob.data.vertices]
    plist = ifc.create_entity('IfcCartesianPointList3D',
                              CoordList=[tuple(round(c, 6) for c in v) for v in verts])
    faces = [ifc.create_entity('IfcIndexedPolygonalFace', CoordIndex=[i + 1 for i in p.vertices])
             for p in ob.data.polygons if len(p.vertices) >= 3]
    fs = ifc.create_entity('IfcPolygonalFaceSet', Coordinates=plist, Faces=faces, Closed=True)
    body.Items = (fs,)


def sync_all():
    ifc = tool.Ifc.get()
    for n in SYNC:
        ob = bpy.data.objects[n]
        el = tool.Ifc.get_entity(ob)
        sync_element(ifc, ob, el)
    return len(SYNC)


if __name__ == '__main__':
    print('synced', sync_all())
