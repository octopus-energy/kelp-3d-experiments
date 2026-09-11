"""
GBR design temperatures by postcode area.

Maps UK postcode area codes to CIBSE design conditions (air temperature, degree days,
ground temperature).
"""

from typing import Final

from heatloss_engine.models import AreaTemperature


type AreaCode = str


class AreaTemperatureNotFound(Exception): ...


_AREA_TEMPERATURE_MAPPING: Final[dict[AreaCode, AreaTemperature]] = {
    "AB": AreaTemperature("AB", -4.2, 2668, "NE Scotland (Dyce)", 8.5),
    "AL": AreaTemperature("AL", -2, 2033, "Thames Valley (Heathrow)", 11.3),
    "B": AreaTemperature("B", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "BA": AreaTemperature("BA", -1.7, 1835, "Severn Valley (Filton)", 10.6),
    "BB": AreaTemperature("BB", -2.2, 2228, "W Pennines (Ringway)", 10),
    "BD": AreaTemperature("BD", -2.5, 2307, "E Pennines (Finningley)", 10),
    "BH": AreaTemperature("BH", -1.5, 2224, "Southern (Hurn)", 10.4),
    "BL": AreaTemperature("BL", -2.2, 2228, "W Pennines (Ringway)", 10),
    "BN": AreaTemperature("BN", -2.1, 2224, "Southern (Hurn)", 10.4),
    "BR": AreaTemperature("BR", -3.2, 2255, "South-eastern (Gatwick)", 10.2),
    "BS": AreaTemperature("BS", -1.7, 1835, "Severn Valley (Filton)", 10.6),
    "BT": AreaTemperature("BT", -1.2, 2360, "Northern Ireland (Belfast)", 9.4),
    "CA": AreaTemperature("CA", -3.7, 2388, "North-western (Carlisle)", 9.4),
    "CB": AreaTemperature("CB", -2.5, 2033, "Thames Valley (Heathrow)", 11.3),
    "CF": AreaTemperature("CF", -1.6, 1835, "Severn Valley (Filton)", 10.6),
    "CH": AreaTemperature("CH", -2.2, 2228, "W Pennines (Ringway)", 10),
    "CM": AreaTemperature("CM", -2.3, 2033, "Thames Valley (Heathrow)", 11.3),
    "CO": AreaTemperature("CO", -2.3, 2254, "E Anglia (Honington)", 10),
    "CR": AreaTemperature("CR", -2, 2224, "Southern (Hurn)", 10.4),
    "CT": AreaTemperature("CT", -3.2, 2255, "South-eastern (Gatwick)", 10.2),
    "CV": AreaTemperature("CV", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "CW": AreaTemperature("CW", -2.7, 2228, "W Pennines (Ringway)", 10),
    "DA": AreaTemperature("DA", -3.2, 2255, "South-eastern (Gatwick)", 10.2),
    "DD": AreaTemperature("DD", -3.8, 2577, "E Scotland (Leuchars)", 8.8),
    "DE": AreaTemperature("DE", -2.2, 2228, "W Pennines (Ringway)", 10),
    "DG": AreaTemperature("DG", -3.8, 2483, "Borders (Boulmer)", 9),
    "DH": AreaTemperature("DH", -3.7, 2370, "North-eastern (Leeming)", 9.4),
    "DL": AreaTemperature("DL", -3.7, 2388, "North-western (Carlisle)", 9.4),
    "DN": AreaTemperature("DN", -3.4, 2307, "E Pennines (Finningley)", 10),
    "DT": AreaTemperature("DT", -1.7, 2224, "Southern (Hurn)", 10.4),
    "DY": AreaTemperature("DY", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "E": AreaTemperature("E", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "EC": AreaTemperature("EC", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "EH": AreaTemperature("EH", -3.4, 2577, "E Scotland (Leuchars)", 8.8),
    "EN": AreaTemperature("EN", -2.1, 2255, "South-eastern (Gatwick)", 10.2),
    "EX": AreaTemperature("EX", -1.5, 1858, "South-western (Plymouth)", 11),
    "FK": AreaTemperature("FK", -3.7, 2577, "E Scotland (Leuchars)", 8.8),
    "FY": AreaTemperature("FY", -2.2, 2388, "North-western (Carlisle)", 9.4),
    "G": AreaTemperature("G", -3.9, 2494, "W Scotland (Abbotsinch)", 9.1),
    "GL": AreaTemperature("GL", -3.3, 2425, "Midland (Elmdon)", 9.8),
    "GU": AreaTemperature("GU", -2.2, 2033, "Thames Valley (Heathrow)", 11.3),
    "GY": AreaTemperature("GY", -1, 1800, "South-eastern (Gatwick)", 10.2),
    "HA": AreaTemperature("HA", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "HD": AreaTemperature("HD", -3.5, 2307, "E Pennines (Finningley)", 10),
    "HG": AreaTemperature("HG", -3.5, 2307, "E Pennines (Finningley)", 10),
    "HP": AreaTemperature("HP", -2, 2033, "Thames Valley (Heathrow)", 11.3),
    "HR": AreaTemperature("HR", -2, 2425, "Midland (Elmdon)", 9.8),
    "HS": AreaTemperature("HS", -1, 1800, "NW Scotland (Stornoway)", 8.6),
    "HU": AreaTemperature("HU", -3, 2307, "E Pennines (Finningley)", 10),
    "HX": AreaTemperature("HX", -2.5, 2228, "W Pennines (Ringway)", 10),
    "IG": AreaTemperature("IG", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "IM": AreaTemperature("IM", -2.5, 2228, "W Pennines (Ringway)", 10),
    "IP": AreaTemperature("IP", -2.3, 2254, "E Anglia (Honington)", 10),
    "IV": AreaTemperature("IV", -4, 2668, "NE Scotland (Dyce)", 8.5),
    "JE": AreaTemperature("JE", -1, 1800, "South-eastern (Gatwick)", 10.2),
    "KA": AreaTemperature("KA", -3.7, 2494, "W Scotland (Abbotsinch)", 9.1),
    "KT": AreaTemperature("KT", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "KW": AreaTemperature("KW", -4.2, 2668, "NE Scotland (Dyce)", 8.5),
    "KY": AreaTemperature("KY", -3.4, 2577, "E Scotland (Leuchars)", 8.8),
    "L": AreaTemperature("L", -2.4, 2228, "W Pennines (Ringway)", 10),
    "LA": AreaTemperature("LA", -2.2, 2388, "North-western (Carlisle)", 9.4),
    "LD": AreaTemperature("LD", -2.9, 2161, "Wales (Aberporth)", 9.9),
    "LE": AreaTemperature("LE", -3, 2425, "Midland (Elmdon)", 9.8),
    "LL": AreaTemperature("LL", -3, 2228, "W Pennines (Ringway)", 10),
    "LN": AreaTemperature("LN", -3, 2307, "E Pennines (Finningley)", 10),
    "LS": AreaTemperature("LS", -2.5, 2307, "E Pennines (Finningley)", 10),
    "LU": AreaTemperature("LU", -2.4, 2033, "Thames Valley (Heathrow)", 11.3),
    "M": AreaTemperature("M", -2.2, 2228, "W Pennines (Ringway)", 10),
    "ME": AreaTemperature("ME", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "MK": AreaTemperature("MK", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "ML": AreaTemperature("ML", -3.9, 2494, "W Scotland (Abbotsinch)", 9.1),
    "N": AreaTemperature("N", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "NE": AreaTemperature("NE", -3.4, 2370, "North-eastern (Leeming)", 9.4),
    "NG": AreaTemperature("NG", -3.2, 2254, "E Anglia (Honington)", 10),
    "NN": AreaTemperature("NN", -3, 2425, "Midland (Elmdon)", 9.8),
    "NP": AreaTemperature("NP", -1.6, 2425, "Midland (Elmdon)", 9.8),
    "NR": AreaTemperature("NR", -2.4, 2254, "E Anglia (Honington)", 10),
    "NW": AreaTemperature("NW", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "OL": AreaTemperature("OL", -3.2, 2228, "W Pennines (Ringway)", 10),
    "OX": AreaTemperature("OX", -2.4, 2425, "Midland (Elmdon)", 9.8),
    "PA": AreaTemperature("PA", -4, 2494, "W Scotland (Abbotsinch)", 9.1),
    "PE": AreaTemperature("PE", -3, 2254, "E Anglia (Honington)", 10),
    "PH": AreaTemperature("PH", -3.8, 2668, "NE Scotland (Dyce)", 8.5),
    "PL": AreaTemperature("PL", -1.2, 1858, "South-western (Plymouth)", 11),
    "PO": AreaTemperature("PO", -1.8, 2224, "Southern (Hurn)", 10.4),
    "PR": AreaTemperature("PR", -3.2, 2388, "North-western (Carlisle)", 9.4),
    "RG": AreaTemperature("RG", -2.2, 2033, "Thames Valley (Heathrow)", 11.3),
    "RH": AreaTemperature("RH", -1.9, 2033, "Thames Valley (Heathrow)", 11.3),
    "RM": AreaTemperature("RM", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "S": AreaTemperature("S", -2.8, 2228, "W Pennines (Ringway)", 10),
    "SA": AreaTemperature("SA", -1.6, 2161, "Wales (Aberporth)", 9.9),
    "SE": AreaTemperature("SE", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "SG": AreaTemperature("SG", -2, 2033, "Thames Valley (Heathrow)", 11.3),
    "SK": AreaTemperature("SK", -2.9, 2228, "W Pennines (Ringway)", 10),
    "SL": AreaTemperature("SL", -2, 2033, "Thames Valley (Heathrow)", 11.3),
    "SM": AreaTemperature("SM", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "SN": AreaTemperature("SN", -2.2, 2425, "Midland (Elmdon)", 9.8),
    "SO": AreaTemperature("SO", -1.8, 2224, "Southern (Hurn)", 10.4),
    "SP": AreaTemperature("SP", -1.8, 2224, "Southern (Hurn)", 10.4),
    "SR": AreaTemperature("SR", -3.7, 2370, "North-eastern (Leeming)", 9.4),
    "SS": AreaTemperature("SS", -2.3, 2033, "Thames Valley (Heathrow)", 11.3),
    "ST": AreaTemperature("ST", -3, 2228, "W Pennines (Ringway)", 10),
    "SW": AreaTemperature("SW", -1.8, 2033, "Thames Valley (Heathrow)", 11.3),
    "SY": AreaTemperature("SY", -3.3, 2161, "Wales (Aberporth)", 9.9),
    "TA": AreaTemperature("TA", -2.1, 1835, "Severn Valley (Filton)", 10.6),
    "TD": AreaTemperature("TD", -3.8, 2483, "Borders (Boulmer)", 9),
    "TF": AreaTemperature("TF", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "TN": AreaTemperature("TN", -3.2, 2255, "South-eastern (Gatwick)", 10.2),
    "TQ": AreaTemperature("TQ", -1.3, 1858, "South-western (Plymouth)", 11),
    "TR": AreaTemperature("TR", -1.4, 1858, "South-western (Plymouth)", 11),
    "TS": AreaTemperature("TS", -2.9, 2370, "North-eastern (Leeming)", 9.4),
    "TW": AreaTemperature("TW", -1.8, 2203, "Thames Valley (Heathrow)", 11.3),
    "UB": AreaTemperature("UB", -1.8, 2203, "Thames Valley (Heathrow)", 11.3),
    "W": AreaTemperature("W", -1.8, 2203, "Thames Valley (Heathrow)", 11.3),
    "WA": AreaTemperature("WA", -2.1, 2228, "W Pennines (Ringway)", 10),
    "WC": AreaTemperature("WC", -1.8, 2203, "Thames Valley (Heathrow)", 11.3),
    "WD": AreaTemperature("WD", -2, 2203, "Thames Valley (Heathrow)", 11.3),
    "WF": AreaTemperature("WF", -2.5, 2307, "E Pennines (Finningley)", 10),
    "WN": AreaTemperature("WN", -2.1, 2228, "W Pennines (Ringway)", 10),
    "WR": AreaTemperature("WR", -3.3, 2425, "Midland (Elmdon)", 9.8),
    "WS": AreaTemperature("WS", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "WV": AreaTemperature("WV", -3.4, 2425, "Midland (Elmdon)", 9.8),
    "YO": AreaTemperature("YO", -3.7, 2307, "E Pennines (Finningley)", 10),
    "ZE": AreaTemperature("ZE", -3, 2668, "NE Scotland (Dyce)", 8.5),
}

_FALLBACK_AREA: Final[AreaCode] = "BN"


def get_area_temperature_for_area_code(area_code: str) -> AreaTemperature:
    try:
        return _AREA_TEMPERATURE_MAPPING[area_code]
    except KeyError:
        raise AreaTemperatureNotFound(f"No temperature data for area code: {area_code}")


def get_fallback_area_temperature() -> AreaTemperature:
    return get_area_temperature_for_area_code(_FALLBACK_AREA)


def get_area_temperature_for_postcode(postcode: str) -> AreaTemperature:
    """
    Resolve a full postcode (e.g. "SW1A 1AA") to an AreaTemperature.
    Extracts the area code prefix and falls back to BN on failure.
    """
    area_code = "".join(c for c in postcode.split()[0] if c.isalpha()).upper()
    # Try full prefix first, then shorten to first letters only
    for length in range(len(area_code), 0, -1):
        try:
            return get_area_temperature_for_area_code(area_code[:length])
        except AreaTemperatureNotFound:
            continue
    return get_fallback_area_temperature()
