"""Offline, reproducible Broom Road discussion scenarios. No installer approval.

Run with Python 3.12+, attrs and pydantic. Geometry is derived by the app's Node
modules. The local heatloss_engine is adapted, never modified, for explicit
surface boundaries, sloping-room volume and signed internal heat exchange.
"""
from pathlib import Path
import copy
import csv
import hashlib
import json
import re
import subprocess
import sys
from dataclasses import asdict

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from heatloss_engine import models
from heatloss_engine.calculator import HeatLossCalculator, PropertyData, PropertyValues, RoomValues, UValues
from heatloss_engine.enums import AirChangeRateCategory, RoomType
from heatloss_engine.gbr.temperatures import get_area_temperature_for_area_code

DATA = ROOT / '3broomroad-data'
def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def latest_epc(rows):
    exact = [r for r in rows if re.sub(r'[^a-z0-9]', '', r['address1'].lower()) == '3broomroad' and r['postcode'].replace(' ', '').upper() == 'WA159AR']
    if not exact: raise ValueError('No exact 3 Broom Road EPC')
    return sorted(exact, key=lambda r: r['lodgement_datetime'], reverse=True)

PRESETS = {
    'lower': dict(label='Better insulated / less draughty',wall=1.5,window=1.8,floor=.25,loft=.18,roof=.35,ach='CATEGORY_C',bridges=.05),
    'central': dict(label='Working EPC assumptions',wall=2.1,window=3.4,floor=.7,loft=.25,roof=1.0,ach='CATEGORY_B',bridges=.10),
    'higher': dict(label='Poorer fabric / more draughty',wall=2.4,window=4.8,floor=1.0,loft=.4,roof=1.5,ach='CATEGORY_A',bridges=.15),
}
TYPES = {'g-kitchen':RoomType.FAMILY,'g-living':RoomType.LIVING_ROOM,'g-hall':RoomType.HALL,'f-bed1':RoomType.BEDROOM,'f-bed2':RoomType.BEDROOM,'f-bed3':RoomType.BEDROOM,'f-bath':RoomType.BATH,'f-landing':RoomType.LANDING,'lg-study':RoomType.STUDY,'lg-utility':RoomType.UTILITY,'lg-shower':RoomType.SHOWER,'lg-store':RoomType.STORE,'lg-circulation':RoomType.HALL}

class SurfaceCalculator(HeatLossCalculator):
    """Keep the engine's room/ventilation calculation with explicit surface data.

    Upstream party-wall ΔT is a fixed 11K and object losses clip negative room
    exchange. Neither matches this shared-surface graph; override those policies.
    Annual energy is intentionally not exported (it requires a separate audit).
    """
    def __init__(self, data, metadata, temperatures):
        super().__init__(data)
        self.metadata, self.temperatures = metadata, temperatures
    def _get_design_temperature_for_room(self, room): return self.temperatures[room.id]
    def _get_u_value_for_object(self, obj, room): return self.metadata[id(obj)]['u']
    def _get_temperature_difference_for_object(self, obj, room): return abs(self.metadata[id(obj)]['dt'])
    def _get_area_for_object(self, obj, room): return self.metadata[id(obj)]['area'] * 1e6
    def _get_has_energy_usage_for_object(self, obj, room): return False
    def _get_heat_loss_calculation_for_object(self, obj, room):
        result = super()._get_heat_loss_calculation_for_object(obj, room)
        m = self.metadata[id(obj)]
        result.identifier = m['surfaceId']
        result.temperature_difference = m['dt']
        result.heatloss *= -1 if m['dt'] < 0 else 1
        return result

def calculate(source, preset, basement='warm', opening_u=None):
    from heatloss_engine.mapping import get_design_temperature_for_room_type
    geo = source['geometry']; weather = get_area_temperature_for_area_code('WA')
    ids = {r['id']: i+1 for i,r in enumerate(geo['rooms'])}
    temps = {ids[r['id']]: (11 if basement=='cool' and r['levelIdx']==2 else get_design_temperature_for_room_type(TYPES[r['sourceRoomId']])) for r in geo['rooms']}
    rooms, values, meta, bridges = [], [], {}, {}
    for r in geo['rooms']:
        rid=ids[r['id']]; room=models.Room(rid,r['name'],TYPES[r['sourceRoomId']],True,True,True,[],[],[],[],[])
        # Cached metric quantities preserve the actual integrated sloping ceiling.
        room.__dict__['volume']=r['volume']; room.__dict__['floor_area']=r['floorArea']
        bridge=0
        for s in geo['surfaces']:
            if r['id'] not in [s['roomA'],s['roomB']]: continue
            other=s['roomB'] if r['id']==s['roomA'] else s['roomA']
            boundary=s['boundary']; t=temps[rid]
            if other:
                dt=t-temps[ids[other]]; u=1.5 if s['kind']=='wall' else .8
            else:
                u=preset['wall'] if s['kind']=='wall' else preset['floor'] if s['kind']=='floor' else preset['loft'] if s['kind']=='ceiling' else preset['roof']
                adjacent=s.get('adjacentTemperature',18 if boundary=='party' else 10 if boundary in ['ground','unheated'] else .7*10+.3*weather.air_temperature if boundary=='basement-mixed' else weather.air_temperature)
                if adjacent=='room': adjacent=t
                dt=t-adjacent
            def add(area,uv,delta,kind,suffix=''):
                if area < 1e-7: return
                adjacent=ids.get(other)
                if kind in ['roof','ceiling'] or (kind=='interfloor' and r['id']==s['roomA']): obj=models.CeilSection(adjacent,area*1e6);room.ceiling.append(obj)
                elif kind in ['floor','interfloor']:obj=models.FloorSection(adjacent,area*1e6);room.floor.append(obj)
                else:obj=models.ExternalWall(adjacent,len(meta)+1,1000,1000);room.walls.append(obj)
                meta[id(obj)]={'area':area,'u':uv,'dt':delta,'surfaceId':s['id']+suffix}
            add(s['netArea'],u,dt,s['kind'])
            for o in s['openings']:
                # Openings remain outside-facing even on a mixed ground-contact wall.
                add(o['area'],(opening_u or {}).get(o['id'],preset['window']),t-weather.air_temperature,s['kind'],':'+o['id'])
            if not other and boundary!='party': bridge+=s['grossArea']*preset['bridges']*max(0,dt)
        bridges[rid]=bridge
        rooms.append(room)
        values.append(RoomValues(str(rid),UValues(0,0,0,0,0,0,0,0),False,True,False))
    data=PropertyData(models.PropertyPlan([models.Level(1,'All thermal spaces',rooms)]),PropertyValues(AirChangeRateCategory[preset['ach']],weather.air_temperature,weather.ground_temperature,weather.degree_days,tuple(values)))
    results=SurfaceCalculator(data,meta,temps).calculate_heat_loss()
    out=[]
    for r,c in zip(geo['rooms'],results.rooms):
        included=basement=='warm' or r['levelIdx']!=2
        out.append({'id':r['id'],'sourceRoomId':r['sourceRoomId'],'included':included,'temperature':c.design_temperature,'ach':c.air_change_rate,'fabricW':c.fabric_heatloss,'ventilationW':c.ventilation_heatloss,'bridgeRawW':bridges[int(c.id)],'bridgeW':round(bridges[int(c.id)]),'loadW':max(0,c.total_heatloss+round(bridges[int(c.id)])) if included else None,'surfaces':[{k:v for k,v in asdict(x).items() if k!='energy_usage'} for x in c.floor+c.walls+c.ceiling+c.items]})
    return {'rooms':out,'totalW':sum(r['loadW'] or 0 for r in out),'basement':basement,'assumptions':preset}

def thermal_options(source, evidence, scenarios):
    """Independent UA changes, calculated by the same engine for offline call use.

    Each opening and adjustable wall belongs to exactly one group. Combining
    effects is additive before the final room-load clamp and bridge rounding.
    """
    used=set()
    result=copy.deepcopy(evidence)
    for group in result['groups']:
        surfaces=[s for s in source['geometry']['surfaces'] if s.get('boundaryGroup')==group.get('boundaryGroup')] if group['kind']=='boundary' else []
        ids=group.get('openingIds',[])
        targets={('wall',s['id']) for s in surfaces}|{('opening',i) for i in ids}
        if not targets or targets & used: raise ValueError('Missing or overlapping thermal targets: '+group['id'])
        used.update(targets)
        group['surfaceIds']=[s['id'] for s in surfaces]
        group['area']=sum(s['netArea'] for s in surfaces) if surfaces else sum(o['area'] for s in source['geometry']['surfaces'] for o in s['openings'] if o['id'] in ids)
        group['roomIds']=sorted({s['roomA'] for s in source['geometry']['surfaces'] if s in surfaces or any(o['id'] in ids for o in s['openings'])})
        group['effects']={}
        for choice,opt in group['options'].items():
            revised=copy.deepcopy(source)
            for surface in revised['geometry']['surfaces']:
                if surface['id'] in group['surfaceIds'] and 'boundary' in opt:
                    surface['boundary']=opt['boundary']
                    if 'temperature' in opt: surface['adjacentTemperature']=opt['temperature']
            group['effects'][choice]={}
            for key,baseline in scenarios.items():
                fabric,basement=key.split('-')
                variant=calculate(revised,PRESETS[fabric],basement,{i:opt['u'] for i in ids} if 'u' in opt else {})
                delta={}
                for before,after in zip(baseline['rooms'],variant['rooms']):
                    changed=[s for s in after['surfaces'] if s not in before['surfaces']]
                    if changed or abs(after['bridgeRawW']-before['bridgeRawW'])>1e-8:
                        delta[before['id']]={'fabricW':after['fabricW']-before['fabricW'],'bridgeRawW':after['bridgeRawW']-before['bridgeRawW'],'surfaces':changed}
                group['effects'][choice][key]=delta
    exterior=copy.deepcopy(source)
    for surface in exterior['geometry']['surfaces']:
        if surface['boundary']=='party':surface['boundary']='outside'
    result['audit']={'partyArea':sum(s['netArea'] for s in source['geometry']['surfaces'] if s['boundary']=='party'),'mainWallsOutside':{key:calculate(exterior,PRESETS[key.split('-')[0]],key.split('-')[1])['totalW'] for key in scenarios},'coverage':'Only the reconstructed opening inventory is included.'}
    return result

def main():
    source=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/proposal-geometry.cjs')]))
    records=latest_epc(list(csv.DictReader((DATA/'epc_data.csv').open())))
    latest=records[0]
    recommendations=[r for r in csv.DictReader((DATA/'epc_certificates.csv').open()) if r['certificate_number']==latest['certificate_number']]
    evidence=json.loads((DATA/'workflow-observations.json').read_text())
    radiator_estimates=json.loads((DATA/'radiator-estimates.json').read_text())
    manifest=json.loads((DATA/'image-manifest.json').read_text())
    photo_files=[DATA/im['file'] for im in manifest['images'] if im['id'] in radiator_estimates['reviewedImages']]
    operating=json.loads((DATA/'operating-assumptions.json').read_text())
    thermal_evidence=json.loads((DATA/'thermal-evidence.json').read_text())
    photo_files+=list({DATA/im['file'] for im in manifest['images'] if im['id'] in {g.get('imageId') for g in thermal_evidence['groups']}})
    scenarios={f'{k}-{b}':calculate(source,v,b) for k,v in PRESETS.items() for b in ['warm','cool']}
    thermal=thermal_options(source,thermal_evidence,scenarios)
    hashes={str(p.relative_to(ROOT)):digest(p) for p in [DATA/'operating-assumptions.json',DATA/'thermal-evidence.json',DATA/'osdata.json',DATA/'aerial.png',DATA/'floorplan.png',DATA/'radiator-estimates.json',DATA/'image-manifest.json',*photo_files,DATA/'epc_data.csv',DATA/'epc_certificates.csv',DATA/'reconstruction/run.json',DATA/'workflow-observations.json',Path(__file__),ROOT/'scripts/proposal-geometry.cjs',*sorted((ROOT/'heatloss_engine').rglob('*.py')),*sorted((ROOT/'js/building').glob('*.js'))]}
    revision=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16]
    package={'schemaVersion':1,'propertyId':'3broomroad','address':'3 Broom Road, Hale','postcode':'WA15 9AR','revision':revision,'status':'remote-discussion-only','designApproved':False,'geometry':source,'epc':{'latest':latest,'older':records[1:],'recommendations':recommendations,'selection':'Exact normalized address + postcode; latest lodgement datetime','conflicts':['2015 floor: insulated (assumed). 2026 floor: no insulation (assumed).','EPC 146 m² versus reconstructed gross room coverage %.1f m²; do not rescale automatically.'%sum(r['floorArea'] for r in source['geometry']['rooms']),'multi_glaze_proportion=2 is retained raw; glazing mix is not independently verified.']},'weather':asdict(get_area_temperature_for_area_code('WA')),'scenarios':scenarios,'operatingAssumptions':operating,'thermalEvidence':thermal,'emitterEstimates':radiator_estimates,'interiorPhotos':[{'id':im['id'],'caption':im.get('caption','Interior photo')} for im in manifest['images'] if im.get('kind')=='interior'],'emitters':evidence['emitters'],'surveyTasks':evidence['tasks'],'serviceNodes':evidence['serviceNodes'],'options':evidence['options'],'sourceHashes':hashes,'method':{'engine':'heatloss_engine.calculator.HeatLossCalculator + explicit surface adapter','limits':['Sensitivity scenarios, not confidence intervals or equipment selections.','Room areas include wall/void uncertainty; upper rear room ceiling heights are especially uncertain.','Main side runs are party at 18°C by default. Rear neighbour-side contact remains unresolved; call choices and their effects are recorded separately.','Basement exposed walls assumed 30% air / 70% ground at 10°C; openings outside.','Cool basement is an imposed 11°C boundary hypothesis, not an equilibrium calculation.','Photo-based radiator outputs are catalogue analogues with broad size/type ranges, not measurements; inventories and some room attributions are incomplete.','Thermal bridges use an explicit 0.05–0.15 W/m²K envelope allowance.','Running costs use an explicit annual-heat proxy and assumed seasonal efficiencies. BUS is an assumed deduction, not confirmed eligibility. Equipment performance and regulatory approval remain unverified.'],'sources':[{'title':'Stelrad radiator correction factors','url':'https://www.stelradprofessional.com/stelrad-correction-factor/'},{'title':'Energy Saving Trust: efficient heat pump operation','url':'https://energysavingtrust.org.uk/how-to-ensure-a-heat-pump-runs-efficiently/'}]}}
    dest=DATA/'proposal';dest.mkdir(exist_ok=True)
    previous=dest/'proposal.json'
    if previous.exists() and previous.read_text()!=json.dumps(package,indent=2)+'\n':
        history=dest/'history';history.mkdir(exist_ok=True);old=json.loads(previous.read_text());archive=history/(old['revision']+'.json')
        if not archive.exists():archive.write_text(previous.read_text())
    previous.write_text(json.dumps(package,indent=2)+'\n')
    (dest/'bundle.js').write_text('window.BROOM_PROPOSAL = '+json.dumps(package,separators=(',',':'))+';\n')
    print('Proposal',revision, {k:round(v['totalW']/1000,2) for k,v in scenarios.items()})
if __name__=='__main__':main()
