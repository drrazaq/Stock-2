// Offline ZIP boundary for the single-file archives produced by upload-artifact.
import {inflateRawSync} from 'node:zlib';
export function crc32(b){let c=0xffffffff;for(const x of b){c^=x;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function openCaptureZip(bytes,expectedName,maxPlain=16*1024*1024){
 const fail=()=>{throw Error('ARTIFACT_ZIP_SCOPE_OR_INTEGRITY');};
 if(!Buffer.isBuffer(bytes)||bytes.length<98||bytes.length>16*1024*1024)fail();
 const end=bytes.length-22;if(bytes.readUInt32LE(end)!==0x06054b50||bytes.readUInt16LE(end+4)!==0||bytes.readUInt16LE(end+6)!==0||bytes.readUInt16LE(end+8)!==1||bytes.readUInt16LE(end+10)!==1||bytes.readUInt16LE(end+20)!==0)fail();
 const offset=bytes.readUInt32LE(end+16),length=bytes.readUInt32LE(end+12);if(offset+length!==end||offset<30||length<46||bytes.readUInt32LE(offset)!==0x02014b50)fail();
 const flags=bytes.readUInt16LE(offset+8),method=bytes.readUInt16LE(offset+10),crc=bytes.readUInt32LE(offset+16),compressed=bytes.readUInt32LE(offset+20),plain=bytes.readUInt32LE(offset+24),nameLen=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42),mode=bytes.readUInt32LE(offset+38)>>>16;
 if(![0,8].includes(method)||(flags&~0x808)!==0||plain>maxPlain||plain===0||compressed>16*1024*1024||local!==0||(mode&0xf000)===0xa000||46+nameLen+extra+comment!==length||bytes.toString('utf8',offset+46,offset+46+nameLen)!==expectedName)fail();
 if(bytes.readUInt32LE(0)!==0x04034b50||bytes.readUInt16LE(6)!==flags||bytes.readUInt16LE(8)!==method)fail();
 const ln=bytes.readUInt16LE(26),le=bytes.readUInt16LE(28),start=30+ln+le;if(bytes.toString('utf8',30,30+ln)!==expectedName||start+compressed>offset)fail();
 if(!(flags&8)&&(bytes.readUInt32LE(14)!==crc||bytes.readUInt32LE(18)!==compressed||bytes.readUInt32LE(22)!==plain||start+compressed!==offset))fail();
 if(flags&8){const descriptor=offset-start-compressed;if(![12,16].includes(descriptor))fail();const d=start+compressed+(descriptor===16?4:0);if(descriptor===16&&bytes.readUInt32LE(start+compressed)!==0x08074b50)fail();if(bytes.readUInt32LE(d)!==crc||bytes.readUInt32LE(d+4)!==compressed||bytes.readUInt32LE(d+8)!==plain)fail();}
 const raw=bytes.subarray(start,start+compressed),out=method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:maxPlain});if(out.length!==plain||crc32(out)!==crc)fail();return out;
}
// Used only by fixture ports. Recovery independently accepts stored or deflated archives.
export function fixtureZip(name,body){
 const n=Buffer.from(name),l=Buffer.alloc(30),c=Buffer.alloc(46),e=Buffer.alloc(22),crc=crc32(body);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(crc,14);l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);l.writeUInt16LE(n.length,26);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(n.length,28);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(46+n.length,12);e.writeUInt32LE(30+n.length+body.length,16);return Buffer.concat([l,n,body,c,n,e]);
}
