#!/usr/bin/env python3
"""Read-only retained-artifact feasibility inventory. No network, keys, trading rules or return rerun."""
import argparse, collections, hashlib, json, math, pathlib, re, sys

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--pins", required=True)
    args=ap.parse_args()
    root=pathlib.Path(args.root).resolve()
    pins=json.loads(pathlib.Path(args.pins).read_text())
    objects={}
    integrity={}
    for name,want in pins["files"].items():
        file=root/name
        if file.is_symlink() or any(p.is_symlink() for p in file.parents if p!=root and root in p.parents):
            raise ValueError("SYMLINK_INPUT")
        body=file.read_bytes()
        got=hashlib.sha1(b"blob "+str(len(body)).encode()+b"\0"+body).hexdigest()
        if got!=want:
            raise ValueError("PIN_MISMATCH:"+name)
        integrity[name]={"gitBlob":got,"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()}
        if name.endswith(".json"):
            objects[name]=json.loads(body)
    date=lambda v:isinstance(v,str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}",v))
    real=lambda v:isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
    critical={"acceptanceAt","acceptanceDateTime","sourcePublishedAt","receivedAt","observedAt","firstIngestedAt","bodySha256","originalBody","originalRef","bid","ask","bidSize","askSize","quoteAt","nativeTimestamp"}
    def critical_fields(rows):
        return sorted(set().union(*(set(row)&critical for row in rows))) if rows else []
    graph=objects["data/chain-graph.json"]
    links=objects["data/squad28-links.json"]["links"]
    sup=objects["data/squad28-lab.json"]
    chain=objects["data/chain-decoder.json"]
    macro=objects["data/macro-lab.json"]
    labels=objects["data/squad28-linkcheck.json"]
    by={}
    for kind in ("customer","agreement"):
        rows=[r for r in graph["links"] if r["type"]==kind]
        by[kind]={"rows":len(rows),"dateOnlyFirstPublic":sum(date(r.get("first_public_at")) for r in rows),
                  "sourcePointers":sum(bool(r.get("source_url")) for r in rows),
                  "excerpts":sum(bool(r.get("evidence")) for r in rows),
                  "withStatedValue":sum(real(r.get("value")) for r in rows),
                  "withSupplierRevenue":sum(real(r.get("supplierRevenue")) for r in rows),
                  "originalClockHashOrBBOFields":critical_fields(rows)}
    corrected={}
    for name,row in sup["correctedRun"].items():
        trades=row["trades"]
        corrected[name]={"verdict":row["verdict"],"rows":len(trades),
                         "olderN":row["results"]["older"]["n"],"newerN":row["results"]["newer"]["n"],
                         "olderModelNet":row["results"]["older"]["avg"],"newerModelNet":row["results"]["newer"]["avg"],
                         "originalClockHashOrBBOFields":critical_fields(trades),
                         "timingSummary":{k:row["timing"][k] for k in ("customerReports","by8K","noFiling","sameSession","moved")},
                         "retainedTimingExampleCount":len(row["timing"]["examples"])}
    def verdicts(rows):
        return dict(sorted(collections.Counter(v["verdict"] for v in rows.values()).items()))
    demand=chain["trades"]["CHAIN-DEMAND1"]
    result={
        "kind":"QIMA_MOTIF_RETAINED_INPUT_FEASIBILITY_V1",
        "scope":"Outcome-blind structural inventory plus preservation of already-examined verdicts. No new study/returns, source requests or prospective cases.",
        "sourceCommit":pins["sourceCommit"],
        "proposalTextAvailable":False,
        "proposalScope":"Only the user-described catalyst-to-business-relationship motif; exact five-rule text not supplied or located.",
        "pins":integrity,
        "graph":{"generatedAt":graph["generatedAt"],"counts":graph["counts"],"byType":by,
                 "qualification":"Capability-keyword membership is not a commercial relationship; URL/excerpt presence does not independently authenticate a filing or material obligation."},
        "strictMajorCustomerLinks":{"rows":len(links),"dateOnlyFiled":sum(date(r.get("filed")) for r in links),
                 "accessionRows":sum(bool(r.get("adsh")) for r in links),
                 "excerptRows":sum(bool(r.get("sentence")) for r in links),
                 "originalClockHashOrBBOFields":critical_fields(links),
                 "reportedHandCheck":{"n":len(labels["sample"]),"precision":labels["precision"],"independentlyRelabelled":False}},
        "supplierCorrected":corrected,
        "chainDemand":{"firstRunRows":chain["firstRun"]["results"]["CHAIN-DEMAND1"]["results"]["all"]["n"],
                 "topLevelMonitoringRows":len(demand),"originalClockHashOrBBOFields":critical_fields(demand),
                 "warning":"Monitoring rows are not interchangeable with the frozen firstRun population."},
        "chainFirstRunVerdicts":{k:{"verdict":v["verdict"],"n":v["results"]["all"]["n"]} for k,v in chain["firstRun"]["results"].items()},
        "macro":{"events":len(macro["events"]),"dateOnlyEventField":sum(date(e.get("d")) for e in macro["events"]),
                 "originalClockHashOrBBOFields":critical_fields(macro["events"]),
                 "freeTextClockFragments":sum(any(isinstance(v,str) and re.search(r"[T ]\d\d:\d\d",v) for v in e.values()) for e in macro["events"]),
                 "warning":"A clock fragment in prose is not a normalized, authenticated publication or ingestion timestamp.",
                 "firstRunRuleCount":len(macro["firstRun"]),"firstRunVerdicts":verdicts(macro["firstRun"]),
                 "correctedVerdicts":{k:v["verdict"] for k,v in macro["correctedRun"].items()}},
        "completeAdmissionGradeLinkEventEntryChainsDemonstratedWithinInspectedArtifacts":0,
        "limits":"This is not global absence of originals. Unmounted caches/workspaces/artifacts were not fully searched. Original filing bytes and source predictive skill were not independently authenticated.",
        "decision":"INCONCLUSIVE for exact Qima proposal; STOP implementation/collection. No surviving replacement selected; no new frozen trading protocol.",
        "A":"A remains the separate NOT PROVEN implementation priority; this audit adds no relationship filter or cohort to A."
    }
    print(json.dumps(result,indent=2,sort_keys=True))

if __name__=="__main__":
    main()
