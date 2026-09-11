import unittest
import runpy
from pathlib import Path
_adapter=runpy.run_path(str(Path(__file__).with_name("prepare-proposal.py")))
calculate,latest_epc,PRESETS=(_adapter[k] for k in ["calculate","latest_epc","PRESETS"])

class ProposalTests(unittest.TestCase):
    def test_exact_address_and_latest(self):
        rows=[dict(address1=a,postcode='WA15 9AR',lodgement_datetime=t) for a,t in [('3, Broom Road','2015-01-01 10:00:00'),('3 Broom Road','2026-03-26 14:00:02'),('13 Broom Road','2027-01-01'),('3A Broom Road','2028-01-01')]]
        self.assertEqual([r['address1'] for r in latest_epc(rows)],['3 Broom Road','3, Broom Road'])
    def test_internal_exchange_is_signed_and_conserves(self):
        rooms=[dict(id='a',name='Living',sourceRoomId='g-living',levelIdx=0,floorArea=10,volume=25),dict(id='b',name='Bedroom',sourceRoomId='f-bed1',levelIdx=0,floorArea=10,volume=25)]
        surface=dict(id='shared',kind='wall',roomA='a',roomB='b',boundary='room',netArea=10,grossArea=10,openings=[])
        r=calculate({'geometry':{'rooms':rooms,'surfaces':[surface]}},PRESETS['central'])
        self.assertEqual([x['fabricW'] for x in r['rooms']],[45,-45])
        self.assertEqual(sum(x['fabricW'] for x in r['rooms']),0)
    def test_party_temperature_and_volume(self):
        room=dict(id='a',name='Living',sourceRoomId='g-living',levelIdx=0,floorArea=10,volume=35)
        s=dict(id='party',kind='wall',roomA='a',roomB=None,boundary='party',netArea=10,grossArea=10,openings=[])
        r=calculate({'geometry':{'rooms':[room],'surfaces':[s]}},PRESETS['central'])['rooms'][0]
        self.assertEqual(r['fabricW'],63) # 2.1 * 10 * (21 - 18), not engine's fixed 11K
        self.assertEqual(r['ventilationW'],int(35*.33*1*(21+2.1)))
    def test_openings_subtracted_once(self):
        room=dict(id='a',name='Living',sourceRoomId='g-living',levelIdx=0,floorArea=10,volume=35)
        s=dict(id='outside',kind='wall',roomA='a',roomB=None,boundary='outside',netArea=8,grossArea=10,openings=[dict(id='window',area=2)])
        r=calculate({'geometry':{'rooms':[room],'surfaces':[s]}},PRESETS['central'])['rooms'][0]
        self.assertEqual(r['fabricW'],int(8*2.1*23.1)+int(2*3.4*23.1))
    def test_combined_envelope_choices_match_joint_engine_run(self):
        import json, copy
        data=json.loads((Path(__file__).parents[1]/'3broomroad-data/proposal/proposal.json').read_text())
        source=copy.deepcopy(data['geometry'])
        byid={g['id']:g for g in data['thermalEvidence']['groups']}
        chosen={'rear-neighbour-ground':'heated','bay-lower':'double','main-left':'same'}
        opening_u={}
        for gid,choice in chosen.items():
            group=byid[gid];option=group['options'][choice]
            for s in source['geometry']['surfaces']:
                if s['id'] in group['surfaceIds']:
                    s['boundary']=option['boundary'];s['adjacentTemperature']=option['temperature']
            if 'u' in option:
                opening_u.update({oid:option['u'] for oid in group['openingIds']})
        for key,baseline in data['scenarios'].items():
            fabric,basement=key.split('-')
            joint=calculate(source,PRESETS[fabric],basement,opening_u)
            for before,after in zip(baseline['rooms'],joint['rooms']):
                changes=[byid[gid]['effects'][choice][key].get(before['id'],{}) for gid,choice in chosen.items()]
                expected_fabric=before['fabricW']+sum(c.get('fabricW',0) for c in changes)
                expected_bridge=round(before['bridgeRawW']+sum(c.get('bridgeRawW',0) for c in changes))
                self.assertEqual(after['fabricW'],expected_fabric)
                self.assertEqual(after['bridgeW'],expected_bridge)
                self.assertEqual(after['loadW'],max(0,expected_fabric+expected_bridge+before['ventilationW']) if before['included'] else None)

if __name__=='__main__':unittest.main()
