"""Read the approved workbook using only stdlib; expand actual merged cells.

Usage: python3 scripts/extract-work-catalog.py /path/to/source.xlsx
Quantities, dates and prices remain provenance only, never project budgets.
"""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def extract(path):
    with zipfile.ZipFile(path) as archive:
        strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
        cells = {}
        rows = {}
        for row in sheet.findall('m:sheetData/m:row', NS):
            values = {}
            for cell in row.findall('m:c', NS):
                value = cell.find('m:v', NS)
                inline = cell.find('m:is', NS)
                text = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                if cell.get('t') == 's' and text:
                    text = strings[int(text)]
                if text:
                    text = text.strip()
                    cells[cell.get('r')] = text
                    values[re.sub(r'\d', '', cell.get('r'))] = text
            rows[int(row.get('r'))] = values
        merged = {}
        for cell in sheet.findall('m:mergeCells/m:mergeCell', NS):
            start, end = cell.get('ref').split(':')
            c1, r1 = re.fullmatch(r'([A-Z]+)(\d+)', start).groups()
            c2, r2 = re.fullmatch(r'([A-Z]+)(\d+)', end).groups()
            # Only vertical source columns used by the catalog.
            if c1 == c2:
                for number in range(int(r1), int(r2) + 1):
                    merged[f'{c1}{number}'] = start

        def value(column, number):
            address = f'{column}{number}'
            return cells.get(merged.get(address, address))

        result = []
        for number, row in rows.items():
            if not row.get('A', '').isdigit() or not row.get('G'):
                continue
            sub = value('C', number)
            result.append({
                'sourceKey': 'sequence-20261116:'+row['A'],
                'sourceRow': number,
                'sequenceNumber': int(row['A']),
                'groupName': value('B', number),
                'subgroupNumber': format(float(sub), '.12g'),
                'typeName': value('D', number),
                'name': row['G'],
                'unit': value('P', number),
                'locationDescription': value('K', number),
                'floorDescription': value('L', number),
                'description': value('I', number),
                'sourceValues': {'row': str(number), **row},
            })
        assert len(result) == 293
        assert all(r['groupName'] and r['typeName'] for r in result)
        return result


if __name__ == '__main__':
    result = extract(sys.argv[1])
    target = Path(__file__).resolve().parents[1] / 'lib/reference/work-catalog-20261116.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(f'{len(result)} rows; missing units: {sum(not r["unit"] for r in result)}')
