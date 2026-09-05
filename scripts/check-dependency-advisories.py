import argparse
import concurrent.futures
import json
import pathlib
import re
import sys
import urllib.request

parser = argparse.ArgumentParser(
    description="Check the 45 dependency advisories reviewed for the MVP security upgrade."
)
parser.add_argument(
    "--lockfile",
    type=pathlib.Path,
    default=pathlib.Path(__file__).resolve().parents[1] / "mix.lock",
)
args = parser.parse_args()
lockfile = args.lockfile
ids = [
    "EEF-CVE-2026-65633",
    "EEF-CVE-2026-66882",
    "EEF-CVE-2026-74837",
    "EEF-CVE-2026-75757",
    "EEF-CVE-2026-77454",
    "EEF-CVE-2026-77850",
    "EEF-CVE-2026-77856",
    "EEF-CVE-2026-77950",
    "EEF-CVE-2026-78691",
    "EEF-CVE-2026-78699",
    "EEF-CVE-2026-80227",
    "EEF-CVE-2026-81316",
    "EEF-CVE-2026-81318",
    "EEF-CVE-2026-81852",
    "EEF-CVE-2026-81853",
    "EEF-CVE-2026-82673",
    "EEF-CVE-2026-82681",
    "EEF-CVE-2026-82722",
    "EEF-CVE-2026-82724",
    "EEF-CVE-2026-82725",
    "EEF-CVE-2026-82726",
    "EEF-CVE-2026-82727",
    "EEF-CVE-2026-82728",
    "EEF-CVE-2026-82729",
    "EEF-CVE-2026-82730",
    "EEF-CVE-2026-82731",
    "EEF-CVE-2026-82732",
    "EEF-CVE-2026-82733",
    "EEF-CVE-2026-82734",
    "EEF-CVE-2026-82735",
    "EEF-CVE-2026-82736",
    "EEF-CVE-2026-82737",
    "EEF-CVE-2026-82738",
    "EEF-CVE-2026-82739",
    "EEF-CVE-2026-82740",
    "EEF-CVE-2026-82741",
    "EEF-CVE-2026-82742",
    "EEF-CVE-2026-82743",
    "EEF-CVE-2026-82744",
    "EEF-CVE-2026-82745",
    "EEF-CVE-2026-82746",
    "EEF-CVE-2026-82747",
    "EEF-CVE-2026-82748",
    "EEF-CVE-2026-82749",
    "EEF-CVE-2026-82752",
]
versions = dict(re.findall(r'"([^"\n]+)": \{:hex, :[^,]+, "([^"\n]+)"', lockfile.read_text()))


def inspect(advisory_id):
    url = f"https://cna.erlef.org/osv/{advisory_id}.json"
    with urllib.request.urlopen(url, timeout=30) as response:
        advisory = json.load(response)
    checks = []
    for affected in advisory["affected"]:
        package = affected.get("package", {})
        if package.get("ecosystem") != "Hex":
            continue
        name = package["name"]
        locked = versions[name]
        if "versions" not in affected:
            raise ValueError(f"{advisory_id} has no explicit affected versions")
        checks.append((advisory_id, name, locked, locked in affected["versions"]))
    if not checks:
        raise ValueError(f"{advisory_id} has no Hex package")
    return checks


with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    checks = [check for result in executor.map(inspect, ids) for check in result]
for advisory_id, name, version, vulnerable in checks:
    print(f"{'FAIL' if vulnerable else 'PASS'} {advisory_id} {name} {version}")
failed = sum(check[3] for check in checks)
print(f"{len(checks)} advisory checks, {failed} affected locked versions")
sys.exit(bool(failed))
