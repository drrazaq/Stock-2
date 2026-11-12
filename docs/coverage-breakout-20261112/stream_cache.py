"""Bounded stdlib JSON streaming: one day at a time, never whole-cache JSON materialization."""
import gzip,json
class Stream:
 def __init__(self,f):self.f=f;self.buf='';self.i=0;self.decoder=json.JSONDecoder();self.eof=False;self.total=0
 def more(self):
  self.buf=self.buf[self.i:];self.i=0;b=self.f.read(65536);self.total+=len(b.encode())
  if self.total>1073741824:raise ValueError('DECOMPRESSED_BYTE_CAP')
  self.buf+=b;self.eof=not b
  if len(self.buf.encode())>16777216:raise ValueError('SINGLE_VALUE_BYTE_CAP')
 def peek(self):
  while True:
   while self.i<len(self.buf) and self.buf[self.i].isspace():self.i+=1
   if self.i<len(self.buf):return self.buf[self.i]
   if self.eof:return ''
   self.more()
 def take(self,c):
  if self.peek()!=c:raise ValueError('JSON_STRUCTURE')
  self.i+=1
 def value(self):
  self.peek()
  while True:
   try:
    v,end=self.decoder.raw_decode(self.buf,self.i)
    # Require complete value delimiter, not a number/string prefix at a chunk boundary.
    if end==len(self.buf) and not self.eof:self.more();continue
    if end<len(self.buf) and self.buf[end] not in ',}] \r\n\t:':raise ValueError('JSON_DELIMITER')
    self.i=end;return v
   except json.JSONDecodeError:
    if self.eof:raise ValueError('TRUNCATED_JSON')
    self.more()
def days(path,headers=None):
 with gzip.open(path,'rt',encoding='utf-8') as f:
  s=Stream(f);s.take('{');seen=set()
  while s.peek()!='}':
   key=s.value()
   if not isinstance(key,str) or key in seen:raise ValueError('DUPLICATE_ROOT_KEY')
   seen.add(key);s.take(':')
   if key=='days':
    s.take('{');dates=set()
    while s.peek()!='}':
     d=s.value();s.take(':');row=s.value()
     if not isinstance(d,str) or d in dates:raise ValueError('DUPLICATE_DAY')
     dates.add(d);yield d,row
     if s.peek()!=',':break
     s.take(',')
    s.take('}')
   else:
    v=s.value()
    if headers is not None:headers[key]=v
   if s.peek()!=',':break
   s.take(',')
  s.take('}')
  if s.peek():raise ValueError('TRAILING_JSON')
  if 'days' not in seen:raise ValueError('NO_DAYS')
