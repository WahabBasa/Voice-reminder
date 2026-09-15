"""Live iPhone syslog over Wi-Fi (no USB), non-interactive.

Why this exists: `pymobiledevice3 syslog live --mobdev2` (a) keys its pair-record lookup on the
phone's *advertised* Wi-Fi MAC, which on iOS is a per-network private address that never matches
the hardware MAC stored in the pair record, and (b) yields one candidate per phone address
(public IPv6 + IPv4) and then demands an interactive pick, which a background shell can't answer.
This script connects straight to the phone's IP with the saved pair record and reuses the CLI's
own streaming/formatting code.

Setup (once, over USB):
    pymobiledevice3 lockdown wifi-connections --state on
    pymobiledevice3 lockdown save-pair-record %USERPROFILE%\\.pymobiledevice3\\<UDID>.plist

Usage:
    python scripts/wifi-syslog.py -m Remi -m "[VR"        # substring filters (all must match)
    python scripts/wifi-syslog.py --ip 10.137.48.215        # skip bonjour discovery
    python scripts/wifi-syslog.py --no-debug -o log.txt

PC and phone must share a LAN (currently both on the Galaxy hotspot). Set PYTHONIOENCODING=utf-8.
"""

import argparse
import asyncio
import os
import plistlib
import sys
from pathlib import Path

DEFAULT_UDID = "00008101-000258901EF0801E"


def load_pair_record(udid: str) -> dict:
    candidates = [
        Path.home() / ".pymobiledevice3" / f"{udid}.plist",
        Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Apple" / "Lockdown" / f"{udid}.plist",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "rb") as f:
                return plistlib.load(f)
    sys.exit(f"no pair record for {udid}; run `pymobiledevice3 lockdown save-pair-record` over USB first")


async def discover_ips(timeout: float) -> list[str]:
    from pymobiledevice3.bonjour import browse_mobdev2

    for _ in range(3):
        answers = await browse_mobdev2(timeout=timeout)
        ips = [a.full_ip for ans in answers for a in ans.addresses]
        if ips:
            # prefer plain IPv4, then global IPv6, never link-local (%scope) addresses
            ips.sort(key=lambda ip: (":" in ip, "%" in ip))
            return ips
    return []


async def main() -> None:
    from pymobiledevice3.cli.syslog import SyslogFormat, syslog_live
    from pymobiledevice3.lockdown import create_using_tcp

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--udid", default=DEFAULT_UDID)
    ap.add_argument("--ip", help="phone IP; skips bonjour discovery")
    ap.add_argument("--timeout", type=float, default=10.0, help="bonjour browse timeout per try")
    ap.add_argument("-m", "--match", action="append", default=[], help="substring filter (repeatable, AND)")
    ap.add_argument("-mi", "--match-insensitive", action="append", default=[])
    ap.add_argument("-v", "--invert-match", action="append", default=[])
    ap.add_argument("-e", "--regex", action="append", default=[])
    ap.add_argument("-pn", "--process-name")
    ap.add_argument("--no-debug", action="store_true")
    ap.add_argument("--no-info", action="store_true")
    ap.add_argument("--label", action="store_true", help="include subsystem/category")
    ap.add_argument("-o", "--out", help="also tee every line to this file")
    args = ap.parse_args()

    record = load_pair_record(args.udid)
    ips = [args.ip] if args.ip else await discover_ips(args.timeout)
    if not ips:
        sys.exit("phone not found over bonjour; same Wi-Fi? wifi-connections on? try --ip")

    lockdown = None
    for ip in ips:
        try:
            lockdown = await create_using_tcp(hostname=ip, identifier=args.udid, autopair=False, pair_record=record)
        except Exception as e:  # noqa: BLE001
            print(f"[wifi-syslog] {ip}: {e}", file=sys.stderr)
            continue
        if lockdown.paired:
            break
        await lockdown.service.close()
        lockdown = None
    if lockdown is None:
        sys.exit("could not open a paired lockdown session over Wi-Fi")

    print(f"[wifi-syslog] connected to {lockdown.hostname} ({lockdown.udid}) paired={lockdown.paired}", flush=True)
    out = open(args.out, "a", encoding="utf-8") if args.out else None
    try:
        await syslog_live(
            lockdown,
            out,
            -1,
            args.process_name,
            args.match,
            args.invert_match,
            args.match_insensitive,
            [],
            args.label,
            args.regex,
            [],
            [],
            [],
            no_debug=args.no_debug,
            no_info=args.no_info,
            output_format=SyslogFormat.TEXT,
        )
    finally:
        if out:
            out.close()
        await lockdown.service.close()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
