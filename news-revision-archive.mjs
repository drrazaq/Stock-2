// NEWS FIELD ARCHIVE (CATALYST-03, Claude, 2 Nov 2026). Evidence only; never authorizes a message.
// news-revision-state.mjs decides whether a story revision is new (hash of headline, summary, url, time); that hash and its
// semantics are unchanged. This archive adds, per logical story:
//  - per-field digests of every revision seen (up to 8), so a later reader can tell WHICH field changed;
//  - an attribution digest (related symbols, source, category) that the content hash does not cover. If the same story is
//    later attributed to different symbols or a different source, the story is held back as ATTRIBUTION_CONFLICT (latched).
// Text is NOT stored: the delivery state is published, and story text tied to the owner's holdings must not be added to a
// public file. Keeping full text needs a private storage path (an owner privacy decision; see the package README).
import {createHash} from 'node:crypto';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const d16=x=>createHash('sha256').update(JSON.stringify(x===undefined?null:x)).digest('hex').slice(0,16);
const hex16=x=>typeof x==='string'&&/^[a-f0-9]{16}$/.test(x),hex64=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export const NEWS_FIELD_LIMITS=Object.freeze({stories:10000,revisionsPerStory:8});
export const CONTENT_FIELDS=Object.freeze(['headline','summary','url','datetime']);
const relatedSet=x=>typeof x==='string'?[...new Set(x.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean))].sort():null;
export const attributionOf=row=>d16({related:relatedSet(row?.related),source:typeof row?.source==='string'?row.source.trim():null,category:typeof row?.category==='string'?row.category.trim():null});
export const fieldDigests=row=>Object.fromEntries(CONTENT_FIELDS.map(f=>[f,d16(f==='headline'&&typeof row?.[f]==='string'?row[f].trim():row?.[f]??null)]));
export function validNewsFieldArchive(a){
 return object(a)&&Object.keys(a).length<=NEWS_FIELD_LIMITS.stories&&Object.entries(a).every(([k,e])=>hex64(k)&&object(e)&&hex64(e.first)&&hex16(e.attribution)&&typeof e.attributionConflict==='boolean'&&object(e.revisions)&&Object.keys(e.revisions).length<=NEWS_FIELD_LIMITS.revisionsPerStory&&!!e.revisions[e.first]&&Object.entries(e.revisions).every(([r,v])=>hex64(r)&&object(v)&&Number.isFinite(Date.parse(v.firstObservedAt))&&object(v.fields)&&CONTENT_FIELDS.every(f=>hex16(v.fields[f]))));
}
// logicalId / revision come from observeNewsRevision (64-hex). Returns the archive verdict and which fields changed.
export function observeNewsFields(archive,{logicalId,revision,row,at}){
 if(!object(archive)||!hex64(logicalId)||!hex64(revision)||!Number.isFinite(Date.parse(at)))throw Error('NEWS_FIELD_ARCHIVE_UNREADABLE');
 let e=archive[logicalId];const fields=fieldDigests(row),attribution=attributionOf(row);
 if(e&&!validNewsFieldArchive({[logicalId]:e}))throw Error('NEWS_FIELD_ARCHIVE_UNREADABLE');
 if(!e){if(Object.keys(archive).length>=NEWS_FIELD_LIMITS.stories)return {status:'CAPACITY',changedFields:[]};
  archive[logicalId]={first:revision,attribution,attributionConflict:false,revisions:{[revision]:{firstObservedAt:at,fields}}};return {status:'FIRST',changedFields:[]};}
 const base=e.revisions[e.first].fields,changedFields=CONTENT_FIELDS.filter(f=>base[f]!==fields[f]);
 if(attribution!==e.attribution){e.attributionConflict=true;changedFields.push('attribution');}
 if(!e.revisions[revision]&&Object.keys(e.revisions).length<NEWS_FIELD_LIMITS.revisionsPerStory)e.revisions[revision]={firstObservedAt:at,fields};
 if(e.attributionConflict)return {status:'ATTRIBUTION_CONFLICT',changedFields};
 return {status:revision===e.first?'SAME':'CONTENT_REVISION',changedFields};
}
