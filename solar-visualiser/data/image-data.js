// =====================================================================
// Property image manifest — the output of an offline AI ingest pass over
// data/images/ (currently authored by Claude reading the listing photos;
// later a backend job producing the same JSON).
//
// Everything in here is a SUGGESTION for the UI to offer — nothing is
// applied to the building model without user confirmation, and this file
// is never written to at runtime.
//
// Coordinates:
//  - photo feature bboxes are [x, y, w, h], normalised 0..1, origin top-left
//  - floorplan geometry is in image pixels of the floorplan file;
//    `rooms[].rect` = [x0, y0, x1, y1] wall-centreline rectangles,
//    `rooms[].dims` = the printed metric dimensions [m], unordered
//  - `level` on a plan floor is the building-model level index it maps to
// =====================================================================
window.IMAGE_DATA = {
 "version": 1,
 "basePath": "data/images/",
 "images": [
  {
   "id": "7414078a464769898035bfb4507ead701981bbe8",
   "file": "7414078a464769898035bfb4507ead701981bbe8.webp",
   "kind": "exterior",
   "side": "front",
   "caption": "Front: gable end, attached garage, front door",
   "evidence": "driveway, garage door, house number lamp; gable wall face-on",
   "features": {
    "windows": [
     {
      "bbox": [
       0.24,
       0.33,
       0.09,
       0.09
      ]
     },
     {
      "bbox": [
       0.52,
       0.31,
       0.11,
       0.1
      ]
     },
     {
      "bbox": [
       0.5,
       0.5,
       0.13,
       0.14
      ]
     }
    ],
    "doors": [
     {
      "bbox": [
       0.41,
       0.52,
       0.05,
       0.15
      ]
     }
    ]
   },
   "match": {
    "imageSize": [
     800,
     533
    ],
    "landmarks": [
     {
      "id": "apex_10",
      "px": [
       0.2475,
       0.1669793621013133
      ]
     },
     {
      "id": "apex_12",
      "px": [
       0.23,
       0.1951219512195122
      ]
     },
     {
      "id": "eave_15",
      "px": [
       0.1525,
       0.3696060037523452
      ]
     },
     {
      "id": "eave_9",
      "px": [
       0.34,
       0.324577861163227
      ]
     },
     {
      "id": "ground_9",
      "px": [
       0.34625,
       0.7467166979362101
      ]
     },
     {
      "id": "apex_4",
      "px": [
       0.495,
       0.27392120075046905
      ]
     },
     {
      "id": "apex_16",
      "px": [
       0.57,
       0.2326454033771107
      ]
     },
     {
      "id": "eave_17",
      "px": [
       0.615,
       0.3677298311444653
      ]
     },
     {
      "id": "ground_17",
      "px": [
       0.61125,
       0.624765478424015
      ]
     }
    ],
    "occluders": [
     "box shrub over the window base",
     "lamp post across the facade",
     "oak canopy clipping the right edge"
    ]
   }
  },
  {
   "id": "a81194750e2b2f6a071a65c1cfb04dbd3b906747",
   "file": "a81194750e2b2f6a071a65c1cfb04dbd3b906747.webp",
   "kind": "exterior",
   "side": "front",
   "caption": "Front: wider angle from the drive",
   "evidence": "same elevation as the other front shot, gravel drive",
   "features": {
    "windows": [
     {
      "bbox": [
       0.23,
       0.33,
       0.08,
       0.08
      ]
     },
     {
      "bbox": [
       0.47,
       0.34,
       0.09,
       0.08
      ]
     },
     {
      "bbox": [
       0.48,
       0.48,
       0.12,
       0.12
      ]
     }
    ],
    "doors": [
     {
      "bbox": [
       0.4,
       0.49,
       0.05,
       0.13
      ]
     }
    ]
   },
   "match": {
    "imageSize": [
     800,
     533
    ],
    "landmarks": [
     {
      "id": "apex_10",
      "px": [
       0.513,
       0.203
      ]
     },
     {
      "id": "eave_13",
      "px": [
       0.441,
       0.375
      ]
     },
     {
      "id": "eave_9",
      "px": [
       0.583,
       0.31
      ]
     },
     {
      "id": "ground_9",
      "px": [
       0.621,
       0.647
      ]
     },
     {
      "id": "apex_16",
      "px": [
       0.79,
       0.281
      ]
     }
    ],
    "occluders": [
     "oak tree over the wing gable",
     "lamp post"
    ]
   }
  },
  {
   "id": "4ad03c2f5dc8103f31f3cc542246f0c55994857c",
   "file": "4ad03c2f5dc8103f31f3cc542246f0c55994857c.webp",
   "kind": "exterior",
   "side": "rear",
   "caption": "Rear: garden, two-storey gable + rear wing, patio",
   "evidence": "lawn, pergola over patio, rear extension visible",
   "features": {
    "windows": [
     {
      "bbox": [
       0.42,
       0.28,
       0.08,
       0.07
      ]
     },
     {
      "bbox": [
       0.41,
       0.44,
       0.1,
       0.07
      ]
     }
    ]
   },
   "match": {
    "needsReview": true,
    "imageSize": [
     800,
     533
    ],
    "landmarks": [
     {
      "id": "apex_16",
      "px": [
       0.456,
       0.047
      ]
     },
     {
      "id": "eave_7",
      "px": [
       0.094,
       0.385
      ]
     },
     {
      "id": "eave_17",
      "px": [
       0.765,
       0.366
      ]
     },
     {
      "id": "ground_17",
      "px": [
       0.763,
       0.597
      ]
     }
    ],
    "occluders": [
     "timber shed hides the wall base",
     "planting over the patio corner"
    ]
   }
  },
  {
   "id": "142787e4514aeb8051d988a1b2d2b9b6e1f67034",
   "file": "142787e4514aeb8051d988a1b2d2b9b6e1f67034.webp",
   "kind": "interior",
   "room": {
    "type": "bedroom",
    "confidence": 0.9
   },
   "caption": "Double bedroom (blue) — window with radiator under",
   "evidence": "double bed, built-in wardrobe, radiator under window",
   "features": {
    "windows": [
     {
      "bbox": [
       0.27,
       0.28,
       0.19,
       0.31
      ]
     }
    ],
    "radiators": [
     {
      "bbox": [
       0.23,
       0.6,
       0.2,
       0.1
      ]
     }
    ]
   }
  },
  {
   "id": "cef014ef9a504bcc542435f0a6ca428a7d9ab2fc",
   "file": "cef014ef9a504bcc542435f0a6ca428a7d9ab2fc.webp",
   "kind": "interior",
   "room": {
    "type": "bedroom",
    "confidence": 0.9
   },
   "duplicateOf": "142787e4514aeb8051d988a1b2d2b9b6e1f67034",
   "caption": "Double bedroom (blue) — second angle",
   "evidence": "same room as the other blue-bedroom shot",
   "features": {
    "windows": [
     {
      "bbox": [
       0.28,
       0.28,
       0.17,
       0.3
      ]
     }
    ],
    "radiators": [
     {
      "bbox": [
       0.22,
       0.59,
       0.19,
       0.1
      ]
     }
    ]
   }
  },
  {
   "id": "5a4534239da0d0a8db5c6f5465f4ef099f5960f5",
   "file": "5a4534239da0d0a8db5c6f5465f4ef099f5960f5.webp",
   "kind": "interior",
   "room": {
    "type": "bedroom",
    "confidence": 0.85
   },
   "caption": "Twin bedroom — louvre wardrobes, wide window",
   "evidence": "two single beds, louvred built-in wardrobes, radiator under window",
   "features": {
    "windows": [
     {
      "bbox": [
       0.07,
       0.32,
       0.3,
       0.28
      ]
     }
    ],
    "radiators": [
     {
      "bbox": [
       0.06,
       0.6,
       0.31,
       0.13
      ]
     }
    ]
   }
  },
  {
   "id": "847aea36a23c42f8144ab754a5a5ea9096ea5ac5",
   "file": "847aea36a23c42f8144ab754a5a5ea9096ea5ac5.webp",
   "kind": "interior",
   "room": {
    "type": "bedroom",
    "confidence": 0.6
   },
   "caption": "Empty room — very wide window, long radiator",
   "evidence": "carpeted, double built-in doors; tree-height view suggests first floor",
   "features": {
    "windows": [
     {
      "bbox": [
       0.04,
       0.22,
       0.42,
       0.38
      ]
     }
    ],
    "radiators": [
     {
      "bbox": [
       0.06,
       0.6,
       0.38,
       0.2
      ]
     }
    ]
   }
  },
  {
   "id": "20242a77b148ca0c31361fc64477d4b8dd88e4a3",
   "file": "20242a77b148ca0c31361fc64477d4b8dd88e4a3.webp",
   "kind": "interior",
   "room": {
    "type": "kitchen",
    "confidence": 0.98
   },
   "caption": "Kitchen — window over sink, appliances",
   "evidence": "units, oven, washing machine, sink under window",
   "features": {
    "windows": [
     {
      "bbox": [
       0.53,
       0.3,
       0.28,
       0.22
      ]
     }
    ]
   }
  },
  {
   "id": "a45958365dfcb4bc63db0ab2959b923f557ccedf",
   "file": "a45958365dfcb4bc63db0ab2959b923f557ccedf.webp",
   "kind": "interior",
   "room": {
    "type": "kitchen",
    "confidence": 0.95
   },
   "caption": "Kitchen — run of units, other direction",
   "evidence": "same lime units as the sink shot",
   "features": {}
  },
  {
   "id": "f5a6127b438ddd977bd4a175cd0a925b70bdbd6f",
   "file": "f5a6127b438ddd977bd4a175cd0a925b70bdbd6f.webp",
   "kind": "interior",
   "room": {
    "type": "kitchen",
    "confidence": 0.9
   },
   "caption": "Kitchen dining end — glazed back door, radiator",
   "evidence": "breakfast table, half-glazed external door, radiator below window",
   "features": {
    "radiators": [
     {
      "bbox": [
       0.3,
       0.6,
       0.1,
       0.1
      ]
     }
    ],
    "doors": [
     {
      "bbox": [
       0.68,
       0.3,
       0.17,
       0.5
      ]
     }
    ]
   }
  },
  {
   "id": "3a50ade1d303156732bfbc2ef42dd4f06ff931dd",
   "file": "3a50ade1d303156732bfbc2ef42dd4f06ff931dd.webp",
   "kind": "interior",
   "room": {
    "type": "living",
    "confidence": 0.9,
    "label": "Dining Room"
   },
   "caption": "Dining room — sliding patio doors, radiator",
   "evidence": "dining table, patio slider to garden, radiator on side wall",
   "features": {
    "radiators": [
     {
      "bbox": [
       0,
       0.62,
       0.17,
       0.22
      ]
     }
    ],
    "doors": [
     {
      "bbox": [
       0.17,
       0.17,
       0.33,
       0.65
      ]
     }
    ]
   }
  },
  {
   "id": "9f7cb76267cee3ef42cb8a2ea64d06214022001b",
   "file": "9f7cb76267cee3ef42cb8a2ea64d06214022001b.webp",
   "kind": "interior",
   "room": {
    "type": "living",
    "confidence": 0.9,
    "label": "Dining Room"
   },
   "duplicateOf": "3a50ade1d303156732bfbc2ef42dd4f06ff931dd",
   "caption": "Dining room — patio doors to the rear patio",
   "evidence": "same table/dresser; patio + garden furniture beyond the glass",
   "features": {
    "radiators": [
     {
      "bbox": [
       0.5,
       0.61,
       0.1,
       0.09
      ]
     }
    ],
    "doors": [
     {
      "bbox": [
       0.63,
       0.1,
       0.32,
       0.8
      ]
     }
    ]
   }
  },
  {
   "id": "fde4fd5b720d5c85c71803846be4a6b2a97e929c",
   "file": "fde4fd5b720d5c85c71803846be4a6b2a97e929c.webp",
   "kind": "interior",
   "room": {
    "type": "living",
    "confidence": 0.9,
    "label": "Sitting Room"
   },
   "caption": "Sitting room — floor-to-ceiling glazing, radiator",
   "evidence": "full-height window wall onto front garden; radiator right of door",
   "features": {
    "windows": [
     {
      "bbox": [
       0,
       0.25,
       0.5,
       0.55
      ]
     }
    ],
    "radiators": [
     {
      "bbox": [
       0.53,
       0.55,
       0.08,
       0.1
      ]
     }
    ]
   }
  }
 ],
 "floorplan": {
  "id": "floorplan",
  "file": "floorplan.webp",
  "imageSize": [
   546,
   900
  ],
  "areas": {
   "groundSqM": 79,
   "firstSqM": 66,
   "garageSqM": 13.3
  },
  "floors": [
   {
    "name": "Ground Floor",
    "level": 0,
    "outline": [
     [
      165,
      29
     ],
     [
      390,
      29
     ],
     [
      390,
      40
     ],
     [
      428,
      40
     ],
     [
      428,
      181
     ],
     [
      407,
      181
     ],
     [
      407,
      285
     ],
     [
      30,
      285
     ],
     [
      30,
      126
     ],
     [
      165,
      126
     ]
    ],
    "rooms": [
     {
      "label": "Kitchen/Dining Room",
      "type": "kitchen",
      "dims": [
       4.3,
       3.8
      ],
      "rect": [
       30,
       126,
       165,
       285
      ]
     },
     {
      "label": "Dining Room",
      "type": "living",
      "dims": [
       4,
       2.8
      ],
      "rect": [
       165,
       29,
       269,
       181
      ]
     },
     {
      "label": "Sitting Room",
      "type": "living",
      "dims": [
       4.3,
       4.2
      ],
      "rect": [
       269,
       29,
       428,
       181
      ]
     },
     {
      "label": "Utility Room",
      "type": "storage",
      "dims": [
       1.9,
       1.8
      ],
      "rect": [
       165,
       217,
       234,
       285
      ]
     },
     {
      "label": "Cloakroom",
      "type": "bathroom",
      "dims": null,
      "rect": [
       234,
       217,
       281,
       285
      ]
     },
     {
      "label": "Entrance Hall",
      "type": "hallway",
      "dims": null,
      "labelAt": [
       344,
       233
      ]
     }
    ]
   },
   {
    "name": "1st Floor",
    "level": 1,
    "outline": [
     [
      166,
      514
     ],
     [
      427,
      514
     ],
     [
      427,
      644
     ],
     [
      410,
      644
     ],
     [
      410,
      770
     ],
     [
      30,
      770
     ],
     [
      30,
      610
     ],
     [
      166,
      610
     ]
    ],
    "rooms": [
     {
      "label": "Bedroom Four",
      "type": "bedroom",
      "dims": [
       2.6,
       2.1
      ],
      "rect": [
       166,
       514,
       241,
       610
      ]
     },
     {
      "label": "Shower Room",
      "type": "bathroom",
      "dims": null,
      "rect": [
       241,
       514,
       289,
       610
      ]
     },
     {
      "label": "Bedroom One",
      "type": "bedroom",
      "dims": [
       3.6,
       3.3
      ],
      "rect": [
       289,
       514,
       427,
       644
      ]
     },
     {
      "label": "Wardrobe",
      "type": "storage",
      "dims": null,
      "rect": [
       349,
       644,
       405,
       668
      ]
     },
     {
      "label": "Family Bathroom",
      "type": "bathroom",
      "dims": null,
      "rect": [
       308,
       672,
       410,
       736
      ]
     },
     {
      "label": "Bedroom Two",
      "type": "bedroom",
      "dims": [
       4.3,
       2.8
      ],
      "rect": [
       30,
       610,
       130,
       770
      ]
     },
     {
      "label": "Wardrobes",
      "type": "storage",
      "dims": null,
      "rect": [
       130,
       610,
       166,
       770
      ]
     },
     {
      "label": "Bedroom Three",
      "type": "bedroom",
      "dims": [
       3.4,
       2.8
      ],
      "rect": [
       166,
       643,
       269,
       770
      ]
     },
     {
      "label": "Landing",
      "type": "hallway",
      "dims": null,
      "labelAt": [
       235,
       626
      ]
     }
    ]
   }
  ]
 },
 "listing": {
  "source": "estate-agent description",
  "propertyNotes": [
   "originally three-bedroom; two-storey rear extension (kitchen/dining below, bedroom two above)",
   "en suite shower room off Bedroom One — small corner room with corner cubicle, not yet carved on the plan extraction",
   "gas boiler in the understairs cupboard off the cloakroom",
   "garage attached at the front; potting shed and brick shed in the rear garden"
  ],
  "rooms": [
   {
    "label": "Entrance Hall",
    "floor": 0,
    "windows": [
     "front"
    ],
    "radiators": 1
   },
   {
    "label": "Sitting Room",
    "floor": 0,
    "dims": [
     4.34,
     4.21
    ],
    "windows": [
     "front"
    ],
    "radiators": 2
   },
   {
    "label": "Dining Room",
    "floor": 0,
    "dims": [
     4.01,
     2.84
    ],
    "windows": [
     "rear patio sliders"
    ],
    "radiators": 1
   },
   {
    "label": "Cloakroom",
    "floor": 0,
    "windows": [
     "side obscured"
    ],
    "radiators": 0
   },
   {
    "label": "Kitchen/Dining Room",
    "floor": 0,
    "dims": [
     4.31,
     3.76
    ],
    "windows": [
     "side",
     "side"
    ],
    "doors": [
     "side passage"
    ],
    "radiators": 2
   },
   {
    "label": "Utility Room",
    "floor": 0,
    "dims": [
     1.93,
     1.83
    ],
    "windows": [
     "side obscured"
    ],
    "radiators": 1
   },
   {
    "label": "Landing",
    "floor": 1,
    "windows": [
     "side obscured",
     "rear"
    ],
    "radiators": 1
   },
   {
    "label": "Bedroom One",
    "floor": 1,
    "dims": [
     3.6,
     3.25
    ],
    "windows": [
     "front"
    ],
    "radiators": 1
   },
   {
    "label": "En Suite Shower Room",
    "floor": 1,
    "windows": [],
    "radiators": 0
   },
   {
    "label": "Bedroom Two",
    "floor": 1,
    "dims": [
     4.31,
     2.77
    ],
    "windows": [
     "front",
     "side"
    ],
    "radiators": 1
   },
   {
    "label": "Bedroom Three",
    "floor": 1,
    "dims": [
     3.6,
     2.84
    ],
    "windows": [
     "side"
    ],
    "radiators": 1
   },
   {
    "label": "Bedroom Four",
    "floor": 1,
    "dims": [
     2.59,
     2.06
    ],
    "windows": [
     "rear"
    ],
    "radiators": 1
   },
   {
    "label": "Shower Room",
    "floor": 1,
    "windows": [],
    "radiators": 0
   },
   {
    "label": "Family Bathroom",
    "floor": 1,
    "windows": [
     "front obscured"
    ],
    "radiators": 1
   },
   {
    "label": "Garage",
    "floor": 0,
    "dims": [
     5.28,
     2.54
    ],
    "notes": "attached, not part of the heated envelope"
   }
  ]
 }
}
